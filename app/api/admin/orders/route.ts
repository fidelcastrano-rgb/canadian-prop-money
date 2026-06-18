import { NextRequest, NextResponse } from 'next/server';
import { getD1 } from '@/lib/db';


// Helper to trigger Resend email securely
async function sendResendMail(to: string, subject: string, htmlContent: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ Missing RESEND_API_KEY. Recording simulated log.");
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
      return { success: false, status: "failed" };
    }
  } catch (err) {
    console.error(err);
    return { success: false, status: "failed" };
  }
}

// 1. GET fetches all orders with cascaded details, optionally filtering/searching
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');

    const db = getD1();

    // Select joined list
    const result = await db.prepare("SELECT * FROM orders").all<any>();
    let ordersList = result.results;

    // We join customers, items & history in our API layer so it's clean and safe
    const fullOrders = await Promise.all(ordersList.map(async (o) => {
      const customer = await db.prepare("SELECT * FROM customers WHERE id = ?").bind(o.customer_id).first<any>();
      const items = await db.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(o.id).all<any>();
      const history = await db.prepare("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC").bind(o.id).all<any>();
      const emailLogs = await db.prepare("SELECT * FROM email_logs WHERE order_id = ? ORDER BY created_at DESC").bind(o.id).all<any>();

      return {
        ...o,
        customer,
        items: items.results,
        history: history.results,
        email_logs: emailLogs.results
      };
    }));

    // Filter and search
    let filtered = [...fullOrders];

    if (search) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(f => 
        f.order_number.toLowerCase().includes(q) || 
        (f.customer && (
          f.customer.first_name.toLowerCase().includes(q) || 
          f.customer.last_name.toLowerCase().includes(q) ||
          f.customer.email.toLowerCase().includes(q)
        ))
      );
    }

    if (status && status !== 'all') {
      const s = status.trim().toLowerCase();
      filtered = filtered.filter(f => f.status.toLowerCase() === s);
    }

    // Sort by created_at descending
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json(filtered);
  } catch (err: any) {
    console.error("GET admin orders error:", err);
    return NextResponse.json({ error: "Failed to query administrative orders panel" }, { status: 505 });
  }
}

// 2. POST updates status, triggers emails, or deletes order based on body action
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, orderId, status, emailType } = body;

    if (!orderId) {
      return NextResponse.json({ error: "ID of target order is required" }, { status: 400 });
    }

    const db = getD1();

    // ACTION: UPDATE STATUS
    if (action === 'update_status') {
      if (!status) {
        return NextResponse.json({ error: "New status is required" }, { status: 400 });
      }

      const timestamp = new Date().toISOString();

      // Update order status
      await db.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(status, orderId).run();

      // Write layout history progress row
      const histId = crypto.randomUUID();
      await db.prepare(`
        INSERT INTO order_status_history (id, order_id, status, created_at)
        VALUES (?, ?, ?, ?)
      `).bind(histId, orderId, status, timestamp).run();

      // Optional status specific updates emails can also be implemented here!
      return NextResponse.json({ success: true, message: `Order status set to ${status}` });
    }

    // ACTION: SAVE PAYMENT INSTRUCTIONS OR ALL FIELDS
    if (action === 'save_payment_instructions' || action === 'save_all_payment_fields') {
      const { paymentInstructions, paymentMethod, paymentDeadline } = body;
      if (action === 'save_all_payment_fields') {
        await db.prepare(`
          UPDATE orders 
          SET payment_instructions = ?, payment_method = ?, payment_deadline = ?
          WHERE id = ?
        `).bind(
          paymentInstructions || "", 
          paymentMethod || "", 
          paymentDeadline || null, 
          orderId
        ).run();
      } else {
        await db.prepare("UPDATE orders SET payment_instructions = ? WHERE id = ?").bind(paymentInstructions || "", orderId).run();
      }
      return NextResponse.json({ success: true, message: "Payment parameters updated successfully in D1 database ledger." });
    }

    // ACTION: SEND PAYMENT INSTRUCTIONS
    if (action === 'send_payment_instructions') {
      const { paymentInstructions, subject: customSubject, paymentMethod, paymentDeadline } = body;
      
      console.log("=== SEND PAYMENT DETAILS REQUEST ===");
      console.log("orderId:", orderId, "type:", typeof orderId);

      if (!paymentInstructions || paymentInstructions.trim() === '') {
        console.error("Payment instructions empty string");
        return NextResponse.json({ error: "PAYMENT_INSTRUCTIONS_EMPTY", message: "Payment instructions cannot be empty." }, { status: 400 });
      }

      // 1. Save latest payment instructions, custom payment method and optional deadline to DB
      await db.prepare(`
        UPDATE orders 
        SET payment_instructions = ?, payment_method = ?, payment_deadline = ?
        WHERE id = ?
      `).bind(
        paymentInstructions || "", 
        paymentMethod || "", 
        paymentDeadline || null, 
        orderId
      ).run();
      
      // Load order, customer and item details
      const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first<any>();
      console.log("order result:", order);

      if (!order) {
        return NextResponse.json({ error: "ORDER_LOOKUP_FAILED", message: "Order not found for the given ID." }, { status: 404 });
      }

      const customer = await db.prepare("SELECT * FROM customers WHERE id = ?").bind(order.customer_id).first<any>();
      console.log("customer result:", customer);

      if (!customer) {
        return NextResponse.json({ error: "CUSTOMER_LOOKUP_FAILED", message: "Customer not found for the given order." }, { status: 404 });
      }

      // Customer email validation
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!customer.email || !emailPattern.test(customer.email.trim())) {
        return NextResponse.json({ error: "EMAIL_VALIDATION_FAILED", message: "No valid customer email found for this order." }, { status: 400 });
      }


      const items = await db.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(orderId).all<any>();
      const itemsList = items.results || [];

      const timestamp = new Date().toISOString();
      const finalSubject = customSubject || `Payment Required - Order #${order.order_number}`;

      const paymentEmailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0F0F11; color: #F5F5F5; padding: 40px 15px; max-width: 600px; margin: 0 auto; border-radius: 12px; border: 1px solid #222228; box-sizing: border-box;">
          
          <!-- Company & Branding Header -->
          <div style="text-align: center; border-bottom: 1px solid #222228; padding-bottom: 25px; margin-bottom: 25px;">
            <div style="display: inline-block; background-color: #FF6B1A; color: #FFFFFF; font-weight: 950; font-size: 13px; padding: 6px 14px; border-radius: 4px; text-transform: uppercase; letter-spacing: 2.5px; margin-bottom: 8px; font-family: monospace;">
              CANADIAN PROP MONEY
            </div>
            <p style="color: #8E8E93; font-size: 10px; margin: 0; text-transform: uppercase; letter-spacing: 1.5px;">Official Cinematic Dispatch Bureau</p>
          </div>

          <!-- Hero Heading -->
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; background-color: rgba(239, 68, 68, 0.12); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.25); padding: 4px 12px; border-radius: 99px; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">
              ⚠️ Action Required
            </div>
            <h1 style="font-size: 24px; font-weight: 900; color: #FFFFFF; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 1px;">PAYMENT REQUIRED</h1>
            <p style="font-size: 13px; color: #8E8E93; margin: 0;">Order Reference: <strong style="color: #FF6B1A; font-family: monospace;">#${order.order_number}</strong></p>
          </div>

          <!-- Invoice Snapshot Summary Grid -->
          <div style="background-color: #16161A; border: 1px solid #222228; border-radius: 8px; padding: 18px; margin-bottom: 30px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; font-size: 12px; color: #8E8E93; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Order Number:</td>
                <td style="padding: 6px 0; font-size: 13px; color: #FFFFFF; font-weight: bold; text-align: right; font-family: monospace;">#${order.order_number}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 12px; color: #8E8E93; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Amount Due:</td>
                <td style="padding: 6px 0; font-size: 18px; color: #10B981; font-weight: 900; text-align: right;">$${Number(order.total).toFixed(2)} CAD</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 12px; color: #8E8E93; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Payment Method:</td>
                <td style="padding: 6px 0; font-size: 13px; color: #FF6B1A; font-weight: bold; text-align: right;">${order.payment_method}</td>
              </tr>
              ${order.payment_deadline ? `
              <tr>
                <td style="padding: 6px 0; font-size: 12px; color: #8E8E93; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; vertical-align: middle;">Payment Deadline:</td>
                <td style="padding: 6px 0; font-size: 13px; color: #EF4444; font-weight: bold; text-align: right; font-family: monospace; vertical-align: middle;">${order.payment_deadline}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <!-- PAYMENT INSTRUCTIONS SECTION: Absolute Highest Visual Priority (White block contrast, orange perimeter) -->
          <div style="background-color: #FFFFFF; color: #0A0A0B; border: 3px solid #FF6B1A; border-radius: 12px; padding: 26px 20px; margin-bottom: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: left; box-sizing: border-box;">
            <div style="text-align: center; margin-bottom: 18px;">
              <span style="font-size: 10px; background-color: #FFF2EB; color: #FF6B1A; padding: 4px 10px; border-radius: 4px; display: inline-block; font-weight: bold; border: 1px solid #FFE4D6; text-transform: uppercase; letter-spacing: 1px;">
                Secure Deposit Destination
              </span>
              <h2 style="font-size: 20px; font-weight: 950; color: #0A0A0B; margin: 8px 0 0 0; text-transform: uppercase; letter-spacing: 0.5px;">ADMIN PAYMENT INSTRUCTIONS</h2>
            </div>
            
            <div style="background-color: #F8F9FA; border: 1px solid #E5E7EB; border-radius: 8px; padding: 18px; margin: 0 0 15px 0; box-sizing: border-box; width: 100%; overflow-x: auto;">
              <!-- Code pre preserving breaks cleanly and securely -->
              <pre style="margin: 0; font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace; font-size: 14px; line-height: 1.6; font-weight: bold; color: #111111; white-space: pre-wrap; word-break: break-all; word-wrap: break-word; text-align: left;">${paymentInstructions || "Please render payment using the agreed arrangements."}</pre>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
              <tr>
                <td style="text-align: center; font-size: 11px; color: #7F8C8D; line-height: 1.5; padding: 0;">
                  ⚠️ <strong>IMPORTANT NOTICE:</strong> Please double-check characters when typing or copying addresses. Verified blockchain hash deposits or wire routing transfers are processed immediately and are irreversible.
                </td>
              </tr>
            </table>
          </div>

          <!-- ORDER SUMMARY SECTION (Beneath payment instructions, styled smaller) -->
          <div style="border-top: 1px solid #222228; padding-top: 25px; margin-bottom: 30px;">
            <h3 style="font-size: 11px; color: #8E8E93; text-transform: uppercase; tracking-wider: 1px; margin: 0 0 12px 0;">Purchased Products Details</h3>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="border-bottom: 1px solid #222228; color: #8E8E93; text-align: left;">
                  <th style="padding: 6px 0; font-weight: bold; font-size: 10px; text-transform: uppercase;">Product Description</th>
                  <th style="padding: 6px 0; text-align: center; font-weight: bold; font-size: 10px; text-transform: uppercase; width: 50px;">Qty</th>
                  <th style="padding: 6px 0; text-align: right; font-weight: bold; font-size: 10px; text-transform: uppercase; width: 100px;">Price (CAD)</th>
                </tr>
              </thead>
              <tbody>
                ${itemsList.map((it: any) => `
                  <tr style="border-bottom: 1px solid #111115; color: #E5E5EA;">
                    <td style="padding: 10px 0; font-family: monospace; font-size: 11px;">${it.product_name}</td>
                    <td style="padding: 10px 0; text-align: center; color: #8E8E93;">${it.quantity}</td>
                    <td style="padding: 10px 0; text-align: right; font-family: monospace; color: #34C759;">$${Number(it.price * it.quantity).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; font-family: monospace; color: #8E8E93;">
              <tr>
                <td style="padding: 4px 0;">Subtotal:</td>
                <td style="padding: 4px 0; text-align: right; color: #F5F5F5;">$${Number(order.subtotal).toFixed(2)} CAD</td>
              </tr>
              ${Number(order.discount) > 0 ? `
              <tr>
                <td style="padding: 4px 0; color: #EF4444;">Discount Applied:</td>
                <td style="padding: 4px 0; text-align: right; color: #EF4444;">-$${Number(order.discount).toFixed(2)} CAD</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 4px 0;">Shipping & Handling:</td>
                <td style="padding: 4px 0; text-align: right; color: #F5F5F5;">$${Number(order.shipping).toFixed(2)} CAD</td>
              </tr>
              <tr style="border-top: 1px solid #222228;">
                <td style="padding: 10px 0; font-size: 13px; font-weight: bold; color: #FFFFFF;">TOTAL DUE:</td>
                <td style="padding: 10px 0; font-size: 16px; font-weight: bold; text-align: right; color: #10B981;">$${Number(order.total).toFixed(2)} CAD</td>
              </tr>
            </table>
          </div>

          <!-- Support Information -->
          <div style="background-color: #16161A; border: 1px solid #222228; border-radius: 8px; padding: 15px; margin-bottom: 25px; text-align: center;">
            <p style="font-size: 12px; color: #E5E5EA; margin: 0 0 4px 0; font-weight: bold;">Need Assistance or Live Verification?</p>
            <p style="font-size: 11px; color: #8E8E93; margin: 0; line-height: 1.4;">
              If you have any questions or require dynamic support, please contact our secure prop dispatch department at <a href="mailto:sales@canadianpropmoney.org" style="color: #FF6B1A; text-decoration: none;">sales@canadianpropmoney.org</a> or reply directly to this transaction notice.
            </p>
          </div>

          <div style="border-top: 1px solid #222228; padding-top: 20px; text-align: center; font-size: 10px; color: #636366; line-height: 1.5;">
            <p>© 2026 Canadian Prop Money Inc. All media bundles strictly governed under motion picture guidelines and Bank of Canada criminal code regulations.</p>
          </div>
        </div>
      `;

      const sendRes = await sendResendMail(customer.email, finalSubject, paymentEmailHtml);

      // Save to D1 email_logs table
      const logId = crypto.randomUUID();
      await db.prepare(`
        INSERT INTO email_logs (id, order_id, email_type, recipient, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(logId, orderId, "payment_instructions", customer.email, sendRes.status, timestamp).run();

      // Retrieve current email_history array from orders table and append
      const freshOrder = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first<any>();
      const currentHistory = freshOrder?.email_history ? JSON.parse(freshOrder.email_history) : [];
      
      // Calculate dynamic payment instructions version
      const paymentSendsCount = currentHistory.filter((h: any) => h.subject.toLowerCase().includes("payment") || h.payment_instructions_version).length;
      const versionCounter = paymentSendsCount + 1;

      currentHistory.push({
        created_at: timestamp,
        subject: finalSubject,
        recipient: customer.email,
        payment_method: order.payment_method,
        status: sendRes.status,
        payment_instructions_version: versionCounter,
        payment_instructions: paymentInstructions || "No explicit instructions provided."
      });

      const updatedHistoryStr = JSON.stringify(currentHistory);

      // Save custom columns: email_sent_at, last_email_subject, email_history in orders table
      await db.prepare(`
        UPDATE orders 
        SET email_sent_at = ?, last_email_subject = ?, email_history = ?
        WHERE id = ?
      `).bind(timestamp, finalSubject, updatedHistoryStr, orderId).run();

      return NextResponse.json({ 
        success: true, 
        message: `Payment instructions sent to ${customer.email} (Status: ${sendRes.status})`,
        email_sent_at: timestamp,
        last_email_subject: finalSubject,
        email_history: updatedHistoryStr
      });
    }

    // ACTION: RESEND EMAIL
    if (action === 'resend_email') {
      // Find order details
      const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first<any>();
      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      const customer = await db.prepare("SELECT * FROM customers WHERE id = ?").bind(order.customer_id).first<any>();
      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }

      // Customer email validation
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!customer.email || !emailPattern.test(customer.email.trim())) {
        return NextResponse.json({ error: "No customer email found for this order." }, { status: 400 });
      }

      const items = await db.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(order.id).all<any>();
      const itemsList = items.results;

      const timestamp = new Date().toISOString();
      const subject = `Order Confirmation #${order.order_number}`;

      // Rebuild client confirmation email HTML (No dispatch address, no payment details unless sent separately)
      const customerEmailHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; background-color: #0A0A0B; color: #F5F5F5; padding: 40px 20px; max-width: 600px; margin: 0 auto; border-radius: 8px; border: 1px solid #222;">
          <div style="text-align: center; border-bottom: 1px solid #1F1F22; padding-bottom: 25px;">
            <p style="color: #FF6B1A; font-weight: bold; margin: 0; text-transform: uppercase;">CANADIAN PROP MONEY</p>
            <p style="color: #666; font-size: 11px; margin: 4px 0 0 0;">SYSTEM TRANS-DISPATCH CONFIRMATION (RESENT)</p>
          </div>
          <div style="padding: 25px 5px;">
            <p style="font-size: 14px;">Hello ${customer.first_name},</p>
            <p style="font-size: 14px; line-height: 1.6; color: #CCC;">This is a re-sent order verification summary for reference <strong>${order.order_number}</strong>. If your order status is pending review, you will receive secure payment instructions under separate coverage shortly.</p>
            
            <div style="background-color: #111; border: 1px solid #222; padding: 20px; border-radius: 6px; margin: 25px 0;">
              <p style="margin: 0 0 10px 0; color: #888; text-transform: uppercase; font-size: 11px;">Order Summary Details:</p>
              <div style="padding: 5px 0; font-size: 13px; color: #FFF; font-family: monospace;">
                <div style="margin-bottom: 5px;"><strong>Order Number:</strong> ${order.order_number}</div>
                <div><strong>Status:</strong> ${order.status}</div>
              </div>
              <p style="margin: 15px 0 0 0; font-size: 13px; color: #888;">Order Total: <strong style="color: #10B981;">$${Number(order.total).toFixed(2)} CAD</strong></p>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 15px;">
              <thead>
                <tr style="border-bottom: 1px solid #222; color: #888; text-align: left;">
                  <th style="padding: 6px 0;">Product Info</th>
                  <th style="padding: 6px 0; text-align: center;">Qty</th>
                  <th style="padding: 6px 0; text-align: right;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsList.map((it: any) => `
                  <tr style="border-bottom: 1px solid #111; color: #DDD;">
                    <td style="padding: 10px 0;">${it.product_name}</td>
                    <td style="padding: 10px 0; text-align: center;">${it.quantity}</td>
                    <td style="padding: 10px 0; text-align: right; color: #10B981;">$${Number(it.price * it.quantity).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div style="border-top: 1px solid #1F1F22; padding-top: 20px; text-align: center; font-size: 11px; color: #555;">
            <p>© 2026 Canadian Prop Money Inc. All media bundles strictly governed under motion picture guidelines.</p>
          </div>
        </div>
      `;

      const sendRes = await sendResendMail(customer.email, subject, customerEmailHtml);

      // Save log
      const logId = crypto.randomUUID();
      await db.prepare(`
        INSERT INTO email_logs (id, order_id, email_type, recipient, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(logId, orderId, "customer_order_confirmation_resent", customer.email, sendRes.status, timestamp).run();

      return NextResponse.json({ success: true, message: `Email successfully resent to ${customer.email} (Status: ${sendRes.status})` });
    }

    // ACTION: DELETE ORDER (Strictly cascading database entries cleanly manually)
    if (action === 'delete_order') {
       // 1. Delete order status history entries
       await db.prepare("DELETE FROM order_status_history WHERE order_id = ?").bind(orderId).run();
       
       // 2. Delete email logs entries
       await db.prepare("DELETE FROM email_logs WHERE order_id = ?").bind(orderId).run();

       // 3. Delete order items
       await db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(orderId).run();

       // 4. Delete the parent order
       await db.prepare("DELETE FROM orders WHERE id = ?").bind(orderId).run();

       return NextResponse.json({ success: true, message: "Order records fully deleted and purged from database" });
    }

    return NextResponse.json({ error: "Invalid layout request actions key" }, { status: 400 });
  } catch (err: any) {
    console.error("POST admin orders error:", err);
    return NextResponse.json({ error: "ACTION_FAILED", message: err.message || "Administrative order override action failed" }, { status: 500 });
  }
}
