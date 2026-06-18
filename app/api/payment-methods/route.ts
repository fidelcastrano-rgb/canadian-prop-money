import { NextResponse, NextRequest } from 'next/server';
import { getD1 } from '@/lib/db';
import { getUniquePaymentMethods } from '@/lib/payment-methods';

export async function GET() {
  try {
    const db = getD1();
    
    // Get unique payment methods active in the customer checkout code
    const checkoutMethods = getUniquePaymentMethods();
    
    // Select existing records from databases
    const dbRes = await db.prepare("SELECT * FROM payment_methods").all<any>();
    const dbList = dbRes.results || [];
    
    // Form a dynamic list aligned exactly with checkout configuration
    const syncedMethods = checkoutMethods.map((method) => {
      const match = dbList.find((dbItem) => dbItem.id === method.id);
      return {
        id: method.id,
        name: method.name, // Always use checkout's current name to reflect renames perfectly
        enabled: match ? match.enabled : 1, // default enabled to 1
        instructions: match ? match.instructions : "" // no hardcoded payment defaults
      };
    });
    
    return NextResponse.json(syncedMethods);
  } catch (err: any) {
    console.error("Payment methods GET error:", err);
    return NextResponse.json({ error: "Failed to retrieve dynamic payment options" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, enabled, instructions } = body;

    if (!id) {
       return NextResponse.json({ error: "Method ID is required" }, { status: 400 });
    }

    const db = getD1();
    
    // Verify if already registered in database
    const match = await db.prepare("SELECT id FROM payment_methods WHERE id = ?").bind(id).first<any>();
    
    if (match) {
      await db.prepare("UPDATE payment_methods SET enabled = ?, instructions = ? WHERE id = ?")
        .bind(enabled ? 1 : 0, instructions || '', id)
        .run();
    } else {
      // Find name from config
      const checkoutMethods = getUniquePaymentMethods();
      const method = checkoutMethods.find(m => m.id === id);
      const name = method ? method.name : id;
      
      await db.prepare(`
        INSERT INTO payment_methods (id, name, enabled, instructions)
        VALUES (?, ?, ?, ?)
      `)
      .bind(id, name, enabled ? 1 : 0, instructions || '')
      .run();
    }

    return NextResponse.json({ success: true, message: "Payment option configuration synced in D1 ledger successfully." });
  } catch (err: any) {
    console.error("Payment methods POST error:", err);
    return NextResponse.json({ error: "Failed to update synced payment methods" }, { status: 505 });
  }
}
