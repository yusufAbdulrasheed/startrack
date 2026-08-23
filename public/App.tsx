import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth, useSession } from "@/lib/session";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { Dashboard } from "@/pages/Dashboard";
import { POS } from "@/pages/POS";
import { Sales } from "@/pages/Sales";
import { Products } from "@/pages/Products";
import { StockIn } from "@/pages/StockIn";
import { Transfers } from "@/pages/Transfers";
import { Returns } from "@/pages/Returns";
import { Jobs } from "@/pages/Jobs";
import { Hotel } from "@/pages/Hotel";
import { MyBusinesses } from "@/pages/MyBusinesses";
import { Platform } from "@/pages/Platform";
import { Customers } from "@/pages/Customers";
import { Expenses } from "@/pages/Expenses";
import { Staff } from "@/pages/Staff";
import { Attendance } from "@/pages/Attendance";
import { Activity } from "@/pages/Activity";
import { Settings } from "@/pages/Settings";
import { Audit } from "@/pages/Audit";

// Owners/managers land on the dashboard; till staff land on the POS.
function Home() {
  const { can } = useSession();
  return <Navigate to={can("dashboard_ops") ? "dashboard" : "pos"} replace />;
}

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
        <Route index element={<Home />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="pos" element={<POS />} />
        <Route path="sales" element={<Sales />} />
        <Route path="products" element={<Products />} />
        <Route path="stock-in" element={<StockIn />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="returns" element={<Returns />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="front-desk" element={<Hotel />} />
        <Route path="businesses" element={<MyBusinesses />} />
        <Route path="platform" element={<Platform />} />
        <Route path="customers" element={<Customers />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="staff" element={<Staff />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="activity" element={<Activity />} />
        <Route path="settings" element={<Settings />} />
        <Route path="audit" element={<Audit />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
