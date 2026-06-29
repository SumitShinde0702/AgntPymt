import { useEffect, useState } from "react";
import { api, type Transaction } from "../lib/api";
import { RecentTransactions } from "../components/dashboard/RecentTransactions";

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    void api<Transaction[]>("/api/transactions").then(setTransactions);
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Transactions</h1>
      <RecentTransactions transactions={transactions} />
    </div>
  );
}
