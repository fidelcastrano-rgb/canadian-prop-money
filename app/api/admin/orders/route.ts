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

    // ACTION: RESEND EMAIL
    if (action === 'resend_email') {
      // Find order details
      const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first<any>();
      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      const customer = await db.prepare("SELECT * FROM customers WHERE id = ?").bind(order.customer_id).first<any>();
      const items = await db.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(order.id).all<any>();
      const pRes = await db.prepare("SELECT * FROM payment_methods WHERE id = ?").bind(order.payment_method).first<any>();
      
      const paymentInstructions = pRes?.instructions || "Instructions will check online details shortly.";
      const itemsList = items.results;

      const timestamp = new Date().toISOString();

      // Rebuild client email HTML
      const customerEmailHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; background-color: #0A0A0B; color: #F5F5F5; padding: 40px 20px; max-width: 600px; margin: 0 auto; border-radius: 8px; border: 1px solid #222;">
          <div style="text-align: center; border-bottom: 1px solid #1F1F22; padding-bottom: 25px;">
            <span style="color: #FF6B1A; font-weight: bold; font-size: 14px;">CANADIAN PROP MONEY</span>
            <p style="color: #666; font-size: 11px; margin: 4px 0 0 0;">SYSTEM TRANS-DISPATCH CONFIRMATION (RESENT)</p>
          </div>
          <div style="padding: 25px 5px;">
            <p style="font-size: 14px;">Hello ${customer.first_name},</p>
            <p style="font-size: 14px; line-height: 1.6; color: #CCC;">This is a re-sent order verification summary for Invoice Reference <strong>${order.order_number}</strong>.</p>
            
            <div style="background-color: #111; border: 1px solid #222; padding: 20px; border-radius: 6px; margin: 25px 0;">
              <p style="margin: 0 0 10px 0; color: #FF6B1A; font-weight: bold; font-size: 11px; text-transform: uppercase;">🔒 HOW TO PAY:</p>
              <p style="margin: 0; color: #FFF; font-size: 13px; line-height: 1.5; font-family: monospace;">${paymentInstructions}</p>
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
        </div>
      `;

      const sendRes = await sendResendMail(customer.email, `Resent Order Confirmation #${order.order_number}`, customerEmailHtml);

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
    return NextResponse.json({ error: "Administrative order override action failed" }, { status: 505 });
  }
}
