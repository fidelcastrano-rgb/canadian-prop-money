'use client';

import { useCart } from '@/lib/store';
import { resolveImageUrl } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { 
  ShieldCheck, Truck, Lock, ArrowLeft, RefreshCw, AlertCircle,
  Send, Coins, Smartphone, Zap, Landmark, CreditCard, Heart, Globe
} from 'lucide-react';

const SHIPPING_OPTIONS = [
  { id: 'normal', name: 'Normal shipping (3-5 days)', price: 20 },
  { id: 'express', name: 'Express shipping (24 hours)', price: 60 },
  { id: 'international', name: 'International shipping (5-7 days)', price: 80 }
];

import { COUNTRY_PAYMENTS, type PaymentOption } from '@/lib/payment-methods';


const renderPaymentIcon = (id: string, className = "w-5 h-5 text-primary shrink-0") => {
  switch (id) {
    case 'e_transfer':
      return <Send className={className} />;
    case 'crypto':
      return <Coins className={className} />;
    case 'apple_cash':
    case 'chime_pay':
      return <Smartphone className={className} />;
    case 'zelle':
      return <Zap className={className} />;
    case 'bank_transfer':
    case 'bank_transfer_payid':
      return <Landmark className={className} />;
    case 'credit_card':
      return <CreditCard className={className} />;
    case 'paypal':
      return <Heart className={className} />;
    default:
      return <Coins className={className} />;
  }
};

export default function CheckoutPage() {
  const { items, totalPrice, totalItems, clearOrder } = useCart();
  const router = useRouter();

  // Loading & States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Form fields
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    country: 'Canada',
    province: '',
    city: '',
    address: '',
    postalCode: '',
    paymentMethod: 'e_transfer',
    shippingOption: 'normal'
  });

  // Redirect if cart is empty
  useEffect(() => {
    if (!loading && totalItems === 0) {
      // Allow some delay before redirect so user doesn't get kicked out right on complete
      const timer = setTimeout(() => {
        router.push('/products');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [totalItems, router, loading]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const nextData = { ...prev, [name]: value };
      if (name === 'country') {
        const correspondingOptions = COUNTRY_PAYMENTS[value] || COUNTRY_PAYMENTS["Canada"];
        if (correspondingOptions && correspondingOptions.length > 0) {
          nextData.paymentMethod = correspondingOptions[0].id;
        }
      }
      return nextData;
    });
    setErrorMsg('');
  };

  const validateForm = () => {
    if (!formData.firstName.trim()) return 'First name is required';
    if (!formData.lastName.trim()) return 'Last name is required';
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return 'Please provide a valid email address';
    if (!formData.phone.trim()) return 'Phone number is required';
    if (!formData.address.trim()) return 'Full street address is required';
    if (!formData.city.trim()) return 'City is required';
    if (!formData.province.trim()) return 'Province / State is required';
    if (!formData.postalCode.trim()) return 'Postal / ZIP code is required';
    if (!formData.paymentMethod) return 'Please select a payment method';
    return null;
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateForm();
    if (error) {
      setErrorMsg(error);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const selectedShipping = SHIPPING_OPTIONS.find(o => o.id === formData.shippingOption) || SHIPPING_OPTIONS[0];
      const calShipping = totalPrice >= 1000 ? 0 : selectedShipping.price;

      const orderPayload = {
        customer: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          country: formData.country,
          province: formData.province,
          city: formData.city,
          address: formData.address,
          postalCode: formData.postalCode
        },
        items: items.map(i => ({
          productId: i.product.id,
          productName: `${i.product.name} (${i.variant.qtyLabel})`,
          quantity: i.qty,
          price: i.variant.price
        })),
        paymentMethod: formData.paymentMethod,
        subtotal: totalPrice,
        shipping: calShipping,
        discount: 0,
        total: totalPrice + calShipping
      };

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(responseData.error || 'Checkout process failed.');
      }

      // Success - Redirect and clean order
      clearOrder();
      router.push(`/thank-you?order_number=${responseData.order_number}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'We encountered a problem submitting your order. Please try again.');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const selectedShipping = SHIPPING_OPTIONS.find(o => o.id === formData.shippingOption) || SHIPPING_OPTIONS[0];
  const shippingCost = totalPrice >= 1000 ? 0 : selectedShipping.price;
  const finalTotal = totalPrice + shippingCost;

  if (totalItems === 0 && !loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
        <p className="text-gray-400 mb-4 font-light text-center">Your basket is empty. Redirecting to collections...</p>
        <Link href="/products" className="py-2.5 px-6 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-gray-200">
          Browse Products
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Navigation back */}
        <Link href="/products" className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-white uppercase tracking-widest mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4 text-primary" /> Return to Catalog
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* LEFT COLUMN: Shipping & Customer Form */}
          <div className="lg:col-span-7 space-y-8">
            <div className="bg-white/5 border border-white/10 p-6 sm:p-8 rounded-xl shadow-xl">
              <h2 className="text-2xl font-light tracking-tight text-white mb-6 uppercase flex items-center gap-3">
                <span className="text-primary text-3xl font-bold">01</span> Billing &amp; Dispatch details
              </h2>

              {errorMsg && (
                <div className="mb-6 p-4 bg-red-950/40 border border-red-500/50 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-200">{errorMsg}</p>
                </div>
              )}

              <form onSubmit={handleCheckoutSubmit} className="space-y-6">
                
                {/* Name fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">First Name *</label>
                    <input 
                      type="text" 
                      name="firstName" 
                      required
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className="w-full bg-black/60 border border-white/10 rounded p-3 text-sm focus:border-primary focus:outline-none transition"
                      placeholder="Francis"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">Last Name *</label>
                    <input 
                      type="text" 
                      name="lastName" 
                      required
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className="w-full bg-black/60 border border-white/10 rounded p-3 text-sm focus:border-primary focus:outline-none transition"
                      placeholder="Delacroix"
                    />
                  </div>
                </div>

                {/* Email / Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">Email Address *</label>
                    <input 
                      type="email" 
                      name="email" 
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full bg-black/60 border border-white/10 rounded p-3 text-sm focus:border-primary focus:outline-none transition"
                      placeholder="francis@cinemascope.ca"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">Phone Number *</label>
                    <input 
                      type="text" 
                      name="phone" 
                      required
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="w-full bg-black/60 border border-white/10 rounded p-3 text-sm focus:border-primary focus:outline-none transition"
                      placeholder="+1 (514) 555-0192"
                    />
                  </div>
                </div>

                {/* Country / Province */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">Country *</label>
                    <select 
                      name="country" 
                      value={formData.country}
                      onChange={handleInputChange}
                      className="w-full bg-black text-white border border-white/10 rounded p-3 text-sm focus:border-primary focus:outline-none transition"
                    >
                      <option value="Canada">Canada</option>
                      <option value="United States">United States</option>
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="Australia">Australia</option>
                      <option value="European Union">European Union</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">Province / State / Region *</label>
                    <input 
                      type="text" 
                      name="province" 
                      required
                      value={formData.province}
                      onChange={handleInputChange}
                      className="w-full bg-black/60 border border-white/10 rounded p-3 text-sm focus:border-primary focus:outline-none transition"
                      placeholder="Quebec"
                    />
                  </div>
                </div>

                {/* Street Address */}
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">Street Address *</label>
                  <input 
                    type="text" 
                    name="address" 
                    required
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full bg-black/60 border border-white/10 rounded p-3 text-sm focus:border-primary focus:outline-none transition"
                    placeholder="7400 Boulevard Saint-Laurent"
                  />
                </div>

                {/* City / Postal Code */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">City *</label>
                    <input 
                      type="text" 
                      name="city" 
                      required
                      value={formData.city}
                      onChange={handleInputChange}
                      className="w-full bg-black/60 border border-white/10 rounded p-3 text-sm focus:border-primary focus:outline-none transition"
                      placeholder="Montreal"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">Postal / Zip Code *</label>
                    <input 
                      type="text" 
                      name="postalCode" 
                      required
                      value={formData.postalCode}
                      onChange={handleInputChange}
                      className="w-full bg-black/60 border border-white/10 rounded p-3 text-sm focus:border-primary focus:outline-none transition"
                      placeholder="H2R 2Y1"
                    />
                  </div>
                </div>

                {/* SHIPPING SELECTION */}
                <div className="border-t border-white/10 pt-6 mt-6">
                  <h3 className="text-lg font-light uppercase tracking-tight text-white mb-4 flex items-center gap-3">
                    <span className="text-primary text-2xl font-bold">1.5</span> Selection of Dispatch &amp; Shipping
                  </h3>

                  <div className="space-y-3">
                    {SHIPPING_OPTIONS.map((option) => {
                      const isSelected = formData.shippingOption === option.id;
                      const isFree = totalPrice >= 1000;
                      const displayPrice = isFree 
                        ? "FREE" 
                        : `$${option.price.toFixed(2)} CAD`;

                      return (
                        <label 
                          key={option.id} 
                          className={`flex items-start gap-4 p-4 rounded-lg border transition cursor-pointer ${
                            isSelected 
                              ? 'bg-primary/5 border-primary text-white' 
                              : 'bg-black/40 border-white/10 text-gray-400 hover:border-white/20'
                          }`}
                        >
                          <input 
                            type="radio" 
                            name="shippingOption" 
                            value={option.id}
                            checked={isSelected}
                            onChange={handleInputChange}
                            className="mt-1 text-primary focus:ring-primary"
                          />
                          <div className="flex-1 flex items-center justify-between">
                            <div>
                              <span className="font-bold text-sm text-white uppercase tracking-wider block flex flex-wrap items-center gap-2">
                                {option.id === 'express' && <Zap className="w-4 h-4 text-amber-400 shrink-0" />}
                                {option.id === 'normal' && <Truck className="w-4 h-4 text-emerald-400 shrink-0" />}
                                {option.id === 'international' && <Globe className="w-4 h-4 text-blue-400 shrink-0" />}
                                {option.name}
                              </span>
                              <span className="block text-[10px] uppercase text-gray-500 tracking-wider mt-1.5 font-mono">
                                {option.id === 'express' ? 'Overnight Express Carriage' : option.id === 'international' ? 'Worldwide Air Cargo Clearing' : 'Insured Secure Ground Dispatch'}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              {isFree ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-xs text-gray-500 line-through font-mono">${option.price.toFixed(2)} CAD</span>
                                  <span className="text-sm font-bold text-emerald-400 font-mono">FREE</span>
                                </div>
                              ) : (
                                <span className="text-sm font-bold text-emerald-400 font-mono">{displayPrice}</span>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* PAYMENT SELECTION */}
                <div className="border-t border-white/10 pt-6 mt-6">
                  <h3 className="text-lg font-light uppercase tracking-tight text-white mb-4 flex items-center gap-3">
                    <span className="text-primary text-2xl font-bold">02</span> Secure Payment Method
                  </h3>

                  <div className="space-y-3">
                    {(COUNTRY_PAYMENTS[formData.country] || COUNTRY_PAYMENTS["Canada"]).map((method) => {
                      const isSelected = formData.paymentMethod === method.id;
                      return (
                        <label 
                          key={method.id} 
                          className={`flex items-start gap-4 p-4 rounded-lg border transition cursor-pointer ${
                            isSelected 
                              ? 'bg-primary/5 border-primary text-white' 
                              : 'bg-black/40 border-white/10 text-gray-400 hover:border-white/20'
                          }`}
                        >
                          <input 
                            type="radio" 
                            name="paymentMethod" 
                            value={method.id}
                            checked={isSelected}
                            onChange={handleInputChange}
                            className="mt-1 text-primary focus:ring-primary"
                          />
                          <div className="flex-1">
                            <span className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                              {renderPaymentIcon(method.id)}
                              {method.name}
                            </span>
                            <span className="block text-xs mt-1.5 text-gray-300 font-light leading-relaxed">
                              The payment options will be email to you via WhatsApp or email once we receive your order.
                            </span>
                            {method.note && (
                              <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/25 rounded">
                                <p className="text-[10px] text-amber-400 font-medium leading-relaxed uppercase tracking-wider">
                                  🔑 {method.note}
                                </p>
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Form submit */}
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 px-6 bg-white hover:bg-gray-200 text-black text-sm font-bold uppercase tracking-widest transition-all rounded shadow-md flex items-center justify-center gap-3 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      SECURELY REGISTERING YOUR ORDER...
                    </>
                  ) : (
                    `SUBMIT ORDER ENQUIRY • $${finalTotal.toFixed(2)} CAD`
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* RIGHT COLUMN: Order Summary */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white/5 border border-white/10 p-6 sm:p-8 rounded-xl sticky top-28 shadow-xl">
              <h3 className="text-xl font-light tracking-tight text-white mb-6 uppercase">Order Summary</h3>

              {/* Items List */}
              <div className="divide-y divide-white/10 max-h-96 overflow-y-auto pr-2 mb-6">
                {items.map((item) => (
                  <div key={item.key} className="py-4 flex gap-4 first:pt-0 last:pb-0">
                    <div className="relative w-16 h-16 bg-black/60 border border-white/10 rounded overflow-hidden shrink-0">
                      <Image 
                        src={resolveImageUrl(item.product.image)} 
                        alt={item.product.name} 
                        fill 
                        className="object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider leading-snug line-clamp-2">{item.product.name}</h4>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-[10px] text-gray-400 font-mono tracking-widest">{item.variant.qtyLabel} x{item.qty}</span>
                        <span className="text-xs font-bold text-emerald-400 font-mono">${(item.variant.price * item.qty).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Financial calculations */}
              <div className="border-t border-white/10 pt-4 space-y-3 font-mono text-xs">
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal:</span>
                  <span>${totalPrice.toFixed(2)} CAD</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Shipping:</span>
                  <span>{shippingCost === 0 ? 'FREE' : `$${shippingCost.toFixed(2)} CAD`}</span>
                </div>
                <div className="border-t border-white/5 pt-3 flex justify-between font-bold text-base text-white">
                  <span className="font-sans uppercase text-sm tracking-widest font-normal">Total Price:</span>
                  <span className="text-emerald-400">${finalTotal.toFixed(2)} CAD</span>
                </div>
              </div>

              {/* Compliance Alerts */}
              <div className="mt-8 p-4 bg-black/40 border border-white/5 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-xs text-amber-500 font-bold uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 shrink-0" /> Film Industry Standard
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed font-light">
                  By submitting this order, you represent that these media replicas will be strictly handled under motion picture and photography clearance guidelines only. Real-time courier dispatch wraps discreetly at sunrise.
                </p>
                <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                  <Truck className="w-3.5 h-3.5" /> 24HR DISCREET BOX-TRACKING OUT
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
