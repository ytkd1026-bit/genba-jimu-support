const CUSTOMERS_KEY = "genba_jimu_customers";

export type Customer = {
  id: string;
  name: string;        // 会社名・元請名
  contactName: string; // 担当者名
  tel: string;
  email: string;
  address: string;
  memo: string;
  createdAt: string;
};

export function getCustomers(): Customer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOMERS_KEY);
    return raw ? (JSON.parse(raw) as Customer[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomer(customer: Customer): void {
  const list = getCustomers();
  const idx = list.findIndex((c) => c.id === customer.id);
  if (idx >= 0) {
    list[idx] = customer;
  } else {
    list.unshift(customer);
  }
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(list));
}

export function deleteCustomer(id: string): void {
  const list = getCustomers().filter((c) => c.id !== id);
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(list));
}
