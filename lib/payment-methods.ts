export interface PaymentOption {
  id: string;
  name: string;
  isCrypto?: boolean;
  note?: string;
}

export const COUNTRY_PAYMENTS: Record<string, PaymentOption[]> = {
  "Canada": [
    { id: "e_transfer", name: "E-Transfer" },
    { id: "crypto", name: "Crypto Currency (Bitcoin, USDT, Ethereum)", isCrypto: true, note: "Crypto currency is the preferred payment option for those who wants to be anonymous." }
  ],
  "United States": [
    { id: "crypto", name: "Crypto Currency", isCrypto: true, note: "Crypto currency is the preferred payment option for those who wants to be anonymous." },
    { id: "apple_cash", name: "Apple Cash" },
    { id: "chime_pay", name: "Chime pay" },
    { id: "zelle", name: "Zelle" }
  ],
  "United Kingdom": [
    { id: "crypto", name: "Crypto Currency", isCrypto: true, note: "Crypto currency is the preferred payment option for those who wants to be anonymous." },
    { id: "bank_transfer", name: "Bank Transfer" },
    { id: "credit_card", name: "Credit Card (Master Card only)" }
  ],
  "European Union": [
    { id: "crypto", name: "Crypto Currency", isCrypto: true, note: "Crypto currency is the preferred payment option for those who wants to be anonymous." },
    { id: "credit_card", name: "Credit Card (Master Card only)" },
    { id: "paypal", name: "PayPal (Friends and Family only)" }
  ],
  "Australia": [
    { id: "crypto", name: "Crypto Currency", isCrypto: true, note: "Crypto currency is the preferred payment option for those who wants to be anonymous." },
    { id: "bank_transfer_payid", name: "Bank Transfer (PayID)" },
    { id: "credit_card", name: "Credit Card (Master Card only)" }
  ]
};

// Helper to get all unique payment methods across countries
export function getUniquePaymentMethods(): { id: string; name: string }[] {
  const seen = new Set<string>();
  const list: { id: string; name: string }[] = [];
  Object.values(COUNTRY_PAYMENTS).forEach((options) => {
    options.forEach((opt) => {
      if (!seen.has(opt.id)) {
        seen.add(opt.id);
        list.push({ id: opt.id, name: opt.name });
      }
    });
  });
  return list;
}

// Maps method ID to customer-friendly display label based on matching name
export function getPaymentMethodName(id: string): string {
  for (const countryOptions of Object.values(COUNTRY_PAYMENTS)) {
    const found = countryOptions.find(o => o.id === id);
    if (found) return found.name;
  }
  return id;
}
