import { Navigate, Route, Routes } from "react-router-dom";
import {
  Package,
  PackagePlus,
  ArrowLeftRight,
  Undo2,
  Users,
  ReceiptText,
  UserCog,
  Clock,
  History,
  Settings,
  ScrollText,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/lib/session";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { Dashboard } from "@/pages/Dashboard";
import { POS } from "@/pages/POS";
import { Placeholder } from "@/pages/Placeholder";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="pos" element={<POS />} />
        <Route path="products" element={<Placeholder title="Products" subtitle="Your catalog — prices, barcodes, reorder levels" icon={Package} phase="Phase 2" />} />
        <Route path="stock-in" element={<Placeholder title="Stock In" subtitle="Receive goods into a branch" icon={PackagePlus} phase="Phase 2" />} />
        <Route path="transfers" element={<Placeholder title="Transfers" subtitle="Move stock between branches" icon={ArrowLeftRight} phase="Phase 2" />} />
        <Route path="returns" element={<Placeholder title="Returns" subtitle="Submit and approve customer returns" icon={Undo2} phase="Phase 3" />} />
        <Route path="customers" element={<Placeholder title="Customers" subtitle="Who buys from you, and how often" icon={Users} phase="Phase 3" />} />
        <Route path="expenses" element={<Placeholder title="Expenses" subtitle="Track business expenditure" icon={ReceiptText} phase="Phase 3" />} />
        <Route path="staff" element={<Placeholder title="Staff" subtitle="Team, roles, permissions and PINs" icon={UserCog} phase="Phase 1" />} />
        <Route path="attendance" element={<Placeholder title="Attendance" subtitle="Clock-ins, hours and shifts" icon={Clock} phase="Phase 3" />} />
        <Route path="activity" element={<Placeholder title="My Activity" subtitle="Your own sales and reprints" icon={History} phase="Phase 3" />} />
        <Route path="settings" element={<Placeholder title="Settings" subtitle="Business profile, VAT, receipts, alerts" icon={Settings} phase="Phase 1" />} />
        <Route path="audit" element={<Placeholder title="Audit Log" subtitle="Every sensitive action, on the record" icon={ScrollText} phase="Phase 4" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
