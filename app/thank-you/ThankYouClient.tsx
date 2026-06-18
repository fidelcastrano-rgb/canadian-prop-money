'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  CheckCircle, ArrowRight, Shield, AlertTriangle, Copy, Check,
  Send, Coins, Smartphone, Zap, Landmark, CreditCard, Heart
} from 'lucide-react';

const renderPaymentIconByDisplayName = (methodName: string, className = "w-5 h-5 text-primary shrink-0") => {
  const name = (methodName || "").toLowerCase();
  
  if (name.includes('e-transfer')) {
    return <Send className={className} />;
  } else if (name.includes('crypto')) {
    return <Coins className={className} />;
  } else if (name.includes('apple cash')) {
    return <Smartphone className={className} />;
  } else if (name.includes('chime')) {
    return <Smartphone className={className} />;
  } else if (name.includes('zelle')) {
    return <Zap className={className} />;
  } else if (name.includes('bank') || name.includes('payid')) {
    return <Landmark className={className} />;
  } else if (name.includes('credit card') || name.includes('master')) {
    return <CreditCard className={className} />;
  } else if (name.includes('paypal')) {
    return <Heart className={className} />;
  }
  return <Coins className={className} />;
};

interface OrderDetails {
  order_number: string;
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    province: string;
    postal_code: string;
    country: string;
  };
  items: Array<{
    product_name: string;
    quantity: number;
    price: number;
  }>;
}

export default function ThankYouClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderNumber = searchParams ? searchParams.get('order_number') : null;

  const [loading, setLoading] = useState(!!orderNumber);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [copied, setCopied] = useState(false);
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    if (!orderNumber) {
      return;
    }

    async function fetchOrder() {
      try {
        const res = await fetch(`/api/checkout?order_number=${orderNumber}`);
        if (res.ok) {
          const data = await res.json();
          setOrder(data);
          
          // Fetch instructions for this payment method
          const pRes = await fetch('/api/payment-methods');
          if (pRes.ok) {
            const methods = await pRes.json();
            const matching = methods.find((m: any) => m.id === data.payment_method || m.name === data.payment_method);
            if (matching) {
              setInstructions(matching.instructions);
            }
          }
        }
      } catch (err) {
        console.error('Failed to retrieve order confirmation details:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchOrder();
  }, [orderNumber]);

  const handleCopy = () => {
    if (orderNumber) {
      navigator.clipboard.writeText(orderNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-white flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
        <p className="text-gray-400 font-light uppercase tracking-widest text-xs">Retrieving Order Details...</p>
      </div>
    );
  }

  if (!orderNumber) {
    return (
      <div className="min-h-screen bg-background text-white flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />
        <h2 className="text-2xl font-light tracking-tight uppercase mb-2">Order Not Located</h2>
        <p className="text-gray-400 text-sm max-w-sm mb-6 leading-relaxed">We could not retrieve details for this session. It might have finished processing or been removed.</p>
        <Link href="/products" className="py-2.5 px-6 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-gray-200">
          Return to Shop
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Giant Success Banner */}
        <div className="bg-white/5 border border-white/10 p-8 rounded-2xl text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto" />
          
          <div className="space-y-2">
            <h1 className="text-3xl font-light tracking-tight uppercase">Thank you for your order!</h1>
            <p className="text-sm text-gray-400">Our dispatch agents have received your submission and are verifying print batches.</p>
          </div>

          {/* Copyable Order ID Bar */}
          <div className="inline-flex items-center gap-3 bg-black/60 border border-white/10 px-4 py-2.5 rounded-lg font-mono text-sm max-w-full">
            <span className="text-gray-400">Order Number:</span>
            <span className="text-white font-bold">{order?.order_number || orderNumber}</span>
            <button 
              onClick={handleCopy}
              className="text-primary hover:text-white transition-colors ml-1 p-0.5"
              title="Copy Order Number"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Order Status & Pending Review message according to revision specs */}
        <div className="bg-white/5 border border-white/10 p-6 sm:p-8 rounded-2xl shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5 text-xs text-amber-400 font-bold uppercase tracking-wider">
              <Shield className="w-5 h-5 text-amber-400 shrink-0" /> Order Status
            </div>
            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono font-bold uppercase tracking-widest rounded">
              PENDING REVIEW
            </div>
          </div>
          
          <div className="space-y-4 leading-relaxed font-light text-sm">
            <p className="text-gray-200">
              Your order has been received and is currently under review. Payment instructions will be sent separately by email.
            </p>
            {order?.customer?.email ? (
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg text-xs text-gray-400 font-mono">
                Please monitor your inbox (<span className="text-white font-semibold">{order.customer.email}</span>) for the incoming secure transaction invoice containing your tailored payment setup.
              </div>
            ) : (
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg text-xs text-gray-400 font-mono">
                Please monitor your registered checkout inbox for the incoming secure transaction invoice containing your tailored payment setup.
              </div>
            )}
          </div>
        </div>

        {/* Order Details Accordion (Conditional on successful Order details retrieval) */}
        {order && order.customer && order.items && order.items.length > 0 ? (
          <div className="bg-white/5 border border-white/10 p-6 sm:p-8 rounded-2xl shadow-xl space-y-6">
            <h3 className="text-lg font-light uppercase tracking-tight text-white border-b border-white/10 pb-4">Order Details SUMMARY</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm font-light">
              <div className="space-y-1">
                <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">Delivery Details:</span>
                <p className="text-white font-medium">{order.customer.first_name} {order.customer.last_name}</p>
                <p className="text-gray-400 text-xs">{order.customer.address}, {order.customer.city}</p>
                <p className="text-gray-400 text-xs">{order.customer.province}, {order.customer.postal_code}, {order.customer.country}</p>
              </div>
              <div className="space-y-1">
                <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">Contact Detail:</span>
                <p className="text-gray-400 text-xs">Email: {order.customer.email}</p>
                <p className="text-gray-400 text-xs">Phone: {order.customer.phone}</p>
                <p className="text-gray-400 text-xs">Date: {new Date(order.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="border-t border-white/5 pt-4">
              <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-3">Items Summary:</span>
              <div className="divide-y divide-white/5 font-mono text-xs">
                {order.items.map((item, idx) => (
                  <div key={idx} className="py-2.5 flex justify-between items-center">
                    <span className="text-gray-300 font-sans">{item.product_name} <span className="text-gray-500 font-mono text-[10px] ml-1">x{item.quantity}</span></span>
                    <span className="text-emerald-400">${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* Actions panel */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <Link href="/products" className="w-full sm:w-auto py-3 px-6 bg-transparent hover:bg-white/5 border border-white/20 text-white text-xs font-bold uppercase tracking-widest transition text-center">
            Return to Shop
          </Link>
          <Link 
            href={order?.customer?.email 
              ? `/track-order?order_number=${order?.order_number || orderNumber}&email=${order.customer.email}`
              : `/track-order?order_number=${orderNumber}`}
            className="w-full sm:w-auto py-3 px-8 bg-white hover:bg-gray-200 text-black text-xs font-bold uppercase tracking-widest transition text-center flex items-center justify-center gap-2"
          >
            Track Order Status <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </div>
  );
}
