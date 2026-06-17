import { NextResponse, NextRequest } from 'next/server';
import { getD1 } from '@/lib/db';


export async function GET() {
  try {
    const db = getD1();
    
    // Select payment methods from table. Since we have our mock layer and schema set up,
    // this query compiles and executes cleanly across both.
    const result = await db.prepare("SELECT * FROM payment_methods").all();
    
    return NextResponse.json(result.results);
  } catch (err: any) {
    console.error("Payment methods GET error:", err);
    return NextResponse.json({ error: "Failed to retrieve payment options" }, { status: 500 });
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
    
    // Update the method properties
    await db.prepare("UPDATE payment_methods SET enabled = ?, instructions = ? WHERE id = ?")
      .bind(enabled ? 1 : 0, instructions || '', id)
      .run();

    return NextResponse.json({ success: true, message: "Payment method configuration updated successfully" });
  } catch (err: any) {
    console.error("Payment methods POST error:", err);
    return NextResponse.json({ error: "Failed to update payment options configuration" }, { status: 505 });
  }
}
