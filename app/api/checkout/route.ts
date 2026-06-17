import { NextRequest, NextResponse } from 'next/server';
import { getD1 } from '@/lib/db';


// 1. GET handles getting a specific order's details (for Thank-You and Track-Order)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderNumber = searchParams.get('order_number');
    const email = searchParams.get('email'); // Optional context validation

    if (!orderNumber) {
      return NextResponse.json({ error: "Order number is required" }, { status: 400 });
    }

    const db = getD1();
    
    // We bind the parameters to our prepared statement
    let sql = "SELECT o.* FROM orders o";
    let params: any[] = [];
    
    // If email is provided, we join customers
    if (email) {
      sql = `
        SELECT o.* FROM orders o 
        JOIN customers c ON o.customer_id = c.id
        WHERE o.order_number = ? AND c.email = ?
      `;
      params = [orderNumber.trim(), email.trim().toLowerCase()];
    } else {
      sql = "SELECT o.* FROM orders o WHERE o.order_number = ?";
      params = [orderNumber.trim()];
    }

    const orderRes = await db.prepare(sql).bind(...params).first<any>();

    if (!orderRes) {
      return NextResponse.json({ error: "Order not found with provided identifiers" }, { status: 404 });
    }

    // Load customer, items, and status history logs
    const customer = await db.prepare("SELECT * FROM customers WHERE id = ?").bind(orderRes.customer_id).first<any>();
    const itemsRes = await db.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(orderRes.id).all<any>();
    const historyRes = await db.prepare("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC").bind(orderRes.id).all<any>();

    return NextResponse.json({
      ...orderRes,
      customer,
      items: itemsRes.results,
      history: historyRes.results
    });
  } catch (err: any) {
    console.error("GET checkout error:", err);
    return NextResponse.json({ error: "Failed to load order transaction details" }, { status: 505 });
  }
}

// Helper to trigger Resend email securely
async function sendResendMail(to: string, subject: string, htmlContent: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ [SKIPPED] Missing RESEND_API_KEY. Recording simulated log.");
    return { success: false, status: "simulated" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: "Canadian Prop Money <orders@canadianpropmoney.org>",
        to: [to],
        subject,
        html: htmlContent
      })
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, status: "delivered", id: data.id };
    } else {
      const errTxt = await res.text();
      console.error("Resend API rejected transmission:", errTxt);
      return { success: false, status: "failed", error: errTxt };
    }
  } catch (err: any) {
    console.error("Failure in Resend HTTP call:", err);
    return { success: false, status: "failed", error: err.message };
  }
}

// 2. POST receives and registers checkout form submissions
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customer, items, paymentMethod, subtotal, shipping, discount, total } = body;

    // Server-Side Fields validation
    if (!customer?.firstName || !customer?.lastName || !customer?.email || !customer?.phone || !customer?.address || !customer?.city || !customer?.province || !customer?.postalCode) {
      return NextResponse.json({ error: "Incomplete billing or customer metadata fields" }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Basket items list cannot be empty" }, { status: 400 });
    }

    if (!paymentMethod) {
      return NextResponse.json({ error: "A secure target payment gateway must be selected" }, { status: 400 });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(customer.email)) {
      return NextResponse.json({ error: "Please supply a pristine and valid email format" }, { status: 400 });
    }

    const db = getD1();

    // Generate unique numerical order number sequential like: CPM-2026-000001
    const countRes = await db.prepare("SELECT COUNT(*) as cnt FROM orders").first<{ cnt: number }>();
    const nextCount = (countRes?.cnt ?? 0) + 1;
    const orderNumber = `CPM-2026-${String(nextCount).padStart(6, '0')}`;

    // Lookup existing customer profile by email, or write a new customer ID
    const customerEmailLower = customer.email.trim().toLowerCase();
    const existingCust = await db.prepare("SELECT id FROM customers WHERE email = ?").bind(customerEmailLower).first<{ id: string }>();
    const custId = existingCust?.id || crypto.randomUUID();

    const timestamp = new Date().toISOString();

    if (!existingCust?.id) {
      await db.prepare(`
        INSERT INTO customers (id, first_name, last_name, email, phone, country, province, city, address, postal_code, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        custId,
        customer.firstName.trim(),
        customer.lastName.trim(),
        customerEmailLower,
        customer.phone.trim(),
        customer.country.trim(),
        customer.province.trim(),
        customer.city.trim(),
        customer.address.trim(),
        customer.postalCode.trim(),
        timestamp
      ).run();
    }

    // Helper to determine the payment method display name and instructions based on choice and country
    const getPaymentDetails = (methodId: string, countrySelected: string) => {
      const country = countrySelected || "Canada";
      let name = methodId;
      let instructionsText = "The payment options will be email to you via WhatsApp or email once we receive your order.";

      if (methodId === 'e_transfer') {
        name = "E-Transfer";
        instructionsText = "The E-Transfer payment details will be email to you via WhatsApp or email once we receive your order.";
      } else if (methodId === 'crypto') {
        name = country === "Canada" ? "Crypto Currency (Bitcoin, USDT, Ethereum)" : "Crypto Currency";
        instructionsText = "The Crypto Currency deposit options and wallet addresses will be email to you via WhatsApp or email once we receive your order.";
      } else if (methodId === 'apple_cash') {
        name = "Apple Cash";
        instructionsText = "The Apple Cash transfer details will be email to you via WhatsApp or email once we receive your order.";
      } else if (methodId === 'chime_pay') {
        name = "Chime pay";
        instructionsText = "The Chime pay transfer information will be email to you via WhatsApp or email once we receive your order.";
      } else if (methodId === 'zelle') {
        name = "Zelle";
        instructionsText = "The Zelle payment details will be email to you via WhatsApp or email once we receive your order.";
      } else if (methodId === 'bank_transfer') {
        name = "Bank Transfer";
        instructionsText = "The Bank Transfer details will be email to you via WhatsApp or email once we receive your order.";
      } else if (methodId === 'credit_card') {
        name = "Credit Card (Master Card only)";
        instructionsText = "The Credit Card payment details will be email to you via WhatsApp or email once we receive your order.";
      } else if (methodId === 'paypal') {
        name = "PayPal (Friends and family only)";
        instructionsText = "The PayPal friends & family payment options will be email to you via WhatsApp or email once we receive your order.";
      } else if (methodId === 'payid' || methodId === 'bank_transfer_payid') {
        name = "Bank Transfer (PayID)";
        instructionsText = "The PayID Bank Transfer details will be email to you via WhatsApp or email once we receive your order.";
      }

      return { name, instructionsText };
    };

    const paymentDetails = getPaymentDetails(paymentMethod, customer.country);

    // Insert order registration record
    const orderId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO orders (id, order_number, customer_id, subtotal, shipping, discount, total, payment_method, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderId,
      orderNumber,
      custId,
      Number(subtotal),
      Number(shipping),
      Number(discount),
      Number(total),
      paymentDetails.name,
      "Pending",
      timestamp
    ).run();

    // Insert order purchases item rows
    for (const item of items) {
      const itemId = crypto.randomUUID();
      await db.prepare(`
        INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        itemId,
        orderId,
        item.productId,
        item.productName,
        Number(item.quantity),
        Number(item.price)
      ).run();
    }

    // Register initial timeline history progress row
    const histId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO order_status_history (id, order_id, status, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(histId, orderId, "Pending", timestamp).run();

    // Fetch chosen payment instructions for inclusion in Customer email, or use our customized dynamic instruction fallback
    const pRes = await db.prepare("SELECT * FROM payment_methods WHERE id = ?").bind(paymentMethod).first<any>();
    const paymentInstructions = pRes?.instructions || paymentDetails.instructionsText;

    // BUILD EMAIL TEMPLATES
    const dateFormatted = new Date().toLocaleDateString('en-US', { dateStyle: 'long' });
    
    // CUSTOMER CONFIRMATION TEMPLATE
    const customerEmailHtml = `
      <div style="font-family: system-ui, -apple-system, sans-serif; background-color: #0A0A0B; color: #F5F5F5; padding: 40px 20px; max-width: 600px; margin: 0 auto; border-radius: 8px; border: 1px solid #222;">
        <div style="text-align: center; border-bottom: 1px solid #1F1F22; padding-bottom: 25px;">
          <h2 style="color: #FF6B1A; text-transform: uppercase; tracking-wider: 1px; font-weight: 300; margin: 0;">CANADIAN PROP MONEY</h2>
          <p style="color: #888; font-size: 11px; margin: 5px 0 0 0;">FILM & CINEMATIC REPLICAS CLEARANCE DISPATCH</p>
        </div>
        <div style="padding: 30px 10px;">
          <h1 style="font-size: 20px; font-weight: 400; color: #FFF; margin-top: 0;">Order Enquiry Received</h1>
          <p style="font-size: 14px; line-height: 1.6; color: #CCC;">Hello <strong>${customer.firstName}</strong>,</p>
          <p style="font-size: 14px; line-height: 1.6; color: #CCC;">Your movie props batch enquiry has been registered in the database under transaction number <strong>${orderNumber}</strong>.</p>
          
          <div style="background-color: #111; border: 1px solid #222; padding: 20px; border-radius: 6px; margin: 25px 0; font-family: monospace;">
            <p style="margin: 0 0 10px 0; color: #FF6B1A; font-weight: bold; font-size: 11px; text-transform: uppercase;">🔒 IMMEDIATE ENQUIRY STEPS:</p>
            <p style="margin: 0; color: #FFF; line-height: 1.5; font-size: 13px;">${paymentInstructions}</p>
            <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #222; display: flex; justify-content: space-between; font-size: 14px;">
              <span style="color: #888;">Order Total:</span>
              <strong style="color: #10B981;">$${Number(total).toFixed(2)} CAD</strong>
            </div>
          </div>

          <h3 style="font-size: 13px; color: #FFF; text-transform: uppercase; border-bottom: 1px solid #222; padding-bottom: 5px; margin-top: 30px;">Itemized Specs</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; margin-top: 10px;">
            <thead>
              <tr style="border-bottom: 1px solid #222; color: #888;">
                <th style="padding: 8px 0;">Product</th>
                <th style="padding: 8px 0; text-align: center;">Qty</th>
                <th style="padding: 8px 0; text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it: any) => `
                <tr style="border-bottom: 1px solid #111; color: #DDD;">
                  <td style="padding: 10px 0;">${it.productName}</td>
                  <td style="padding: 10px 0; text-align: center;">${it.quantity}</td>
                  <td style="padding: 10px 0; text-align: right; color: #10B981;">$${Number(it.price * it.quantity).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div style="margin-top: 25px; font-size: 12px; color: #888; background-color: #0F1115; border: 1px solid #1A1D24; padding: 15px; border-radius: 6px;">
            <span style="display: block; font-weight: bold; color: #FFF; margin-bottom: 5px;">📍 Dispatch Destination Address:</span>
            ${customer.address}, ${customer.city}, ${customer.province}, ${customer.postalCode}, ${customer.country}
          </div>
        </div>
        <div style="border-top: 1px solid #1F1F22; padding-top: 20px; text-align: center; font-size: 11px; color: #555;">
          <p>© 2026 Canadian Prop Money Inc. All media bundles strictly governed under motion picture guidelines.</p>
        </div>
      </div>
    `;

    // ADMIN ALERT EMAIL TEMPLATE
    const adminEmailHtml = `
      <div style="font-family: system-ui, -apple-system, sans-serif; background-color: #0F1219; color: #FFF; padding: 40px; max-width: 600px; margin: 0 auto; border-radius: 8px;">
        <div style="border-bottom: 2px solid #E11D48; padding-bottom: 15px; margin-bottom: 25px;">
          <h2 style="color: #E11D48; margin: 0; text-transform: uppercase; font-size: 15px; tracking-wider: 1px;">🚨 HIGH HIGHLIGHT: NEW PROP ORDER ENQUIRY SUBMITTED</h2>
        </div>
        
        <div style="background-color: #161A22; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
          <p style="margin: 0 0 5px 0; font-size: 11px; color: #888;">ORDER REFERENCE</p>
          <h1 style="margin: 0; color: #FFF; font-size: 24px; font-family: monospace;">${orderNumber}</h1>
          <p style="margin: 10px 0 0 0; font-size: 13px; color: #CCC;">Submitted: ${dateFormatted} via <strong>Web Secure checkout</strong></p>
        </div>

        <h3 style="font-size: 13px; color: #ECEEFE; text-transform: uppercase;">Customer Details</h3>
        <p style="font-size: 13px; line-height: 1.5; color: #CCC; margin: 5px 0;">
          Name: <strong>${customer.firstName} ${customer.lastName}</strong><br />
          Email: <a href="mailto:sales@canadianpropmoney.org" style="color: #38BDF8; font-weight: bold;">${customer.email}</a><br />
          Phone: <strong>${customer.phone}</strong><br />
          Shipping: <strong>${customer.address}, ${customer.city}, ${customer.province}, ${customer.postalCode}, ${customer.country}</strong>
        </p>

        <h3 style="font-size: 13px; color: #ECEEFE; text-transform: uppercase; margin-top: 25px;">Financials & Gateway</h3>
        <p style="font-size: 13px; line-height: 1.5; color: #CCC; margin: 5px 0;">
          Payment Gateway: <strong style="color: #FF6B1A; uppercase; font-family: monospace;">${paymentMethod}</strong><br />
          Subtotal: $${Number(subtotal).toFixed(2)} CAD<br />
          Shipping/Dispatch: $${Number(shipping).toFixed(2)} CAD<br />
          Order Total: <strong style="color: #10B981; font-size: 16px;">$${Number(total).toFixed(2)} CAD</strong>
        </p>

        <h3 style="font-size: 13px; color: #ECEEFE; text-transform: uppercase; border-bottom: 1px solid #222; padding-bottom: 5px; margin-top: 25px;">Allocated Products</h3>
        <ul style="padding-left: 15px; margin: 10px 0; font-size: 13px; color: #CCC; line-height: 1.7;">
          ${items.map((it: any) => `<li>${it.productName} &bull; x${it.quantity} &bull; <span style="color: #10B981;">$${Number(it.price * it.quantity).toFixed(2)}</span></li>`).join('')}
        </ul>

        <div style="margin-top: 40px; border-top: 1px solid #222; padding-top: 15px; font-size: 11px; text-align: center; color: #888;">
          Record written to D1 orders ledger table. Assign batch tracking tags immediately on payment arrival.
        </div>
      </div>
    `;

    // SEND EMAILS IN PARALLEL SAFELY USING OUR EDGE ENVOY
    const [custEmailRes, adminEmailRes] = await Promise.all([
      sendResendMail(customerEmailLower, `Order Confirmation #${orderNumber}`, customerEmailHtml),
      sendResendMail("sales@canadianpropmoney.org", `New Order #${orderNumber}`, adminEmailHtml)
    ]);

    // SAVE EMAIL LOG RECORDS TO D1 TABLE
    const custLogId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO email_logs (id, order_id, email_type, recipient, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      custLogId,
      orderId,
      "customer_order_confirmation",
      customerEmailLower,
      custEmailRes.status,
      timestamp
    ).run();

    const adminLogId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO email_logs (id, order_id, email_type, recipient, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      adminLogId,
      orderId,
      "admin_order_notification",
      "sales@canadianpropmoney.org",
      adminEmailRes.status,
      timestamp
    ).run();

    // RETURN ORDER CREATED SUCCESS STATE
    return NextResponse.json({
      success: true,
      order_number: orderNumber,
      order_id: orderId
    });
  } catch (err: any) {
    console.error("POST checkout error:", err);
    return NextResponse.json({ error: err.message || "Failed to finalize checkout registration" }, { status: 505 });
  }
}
