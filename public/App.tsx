import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth, RequirePlatform, useSession } from "@/lib/session";
import { AdminShell } from "@/components/layout/AdminShell";
import { FeatureGate } from "@/components/plan/PlanUi";
import { lazyPage } from "@/lib/lazyPage";
import { BUSINESS_UIS } from "@/businesses";
import { typeMeta } from "@/lib/businessTypes";
import { Suspense } from "react";

// Every page loads on demand, in its own file (see lib/lazyPage.ts).
const Landing = lazyPage(() => import("@/pages/Landing"), "Landing");
const Docs = lazyPage(() => import("@/pages/Docs"), "Docs");
const Login = lazyPage(() => import("@/pages/Login"), "Login");
const Register = lazyPage(() => import("@/pages/Register"), "Register");
const LoyaltyCardView = lazyPage(() => import("@/pages/LoyaltyCardView"), "LoyaltyCardView");
const Dashboard = lazyPage(() => import("@/pages/Dashboard"), "Dashboard");
const AllStores = lazyPage(() => import("@/pages/AllStores"), "AllStores");
const StaffHome = lazyPage(() => import("@/pages/StaffHome"), "StaffHome");
const POS = lazyPage(() => import("@/pages/POS"), "POS");
const Sales = lazyPage(() => import("@/pages/Sales"), "Sales");
const Products = lazyPage(() => import("@/pages/Products"), "Products");
const StockIn = lazyPage(() => import("@/pages/StockIn"), "StockIn");
const Transfers = lazyPage(() => import("@/pages/Transfers"), "Transfers");
const Returns = lazyPage(() => import("@/pages/Returns"), "Returns");
const Jobs = lazyPage(() => import("@/pages/Jobs"), "Jobs");
const Suppliers = lazyPage(() => import("@/pages/Suppliers"), "Suppliers");
const StockCount = lazyPage(() => import("@/pages/StockCount"), "StockCount");
const MyBusinesses = lazyPage(() => import("@/pages/MyBusinesses"), "MyBusinesses");
const Platform = lazyPage(() => import("@/pages/Platform"), "Platform");
const Customers = lazyPage(() => import("@/pages/Customers"), "Customers");
const Expenses = lazyPage(() => import("@/pages/Expenses"), "Expenses");
const Staff = lazyPage(() => import("@/pages/Staff"), "Staff");
const Attendance = lazyPage(() => import("@/pages/Attendance"), "Attendance");
const Activity = lazyPage(() => import("@/pages/Activity"), "Activity");
const Settings = lazyPage(() => import("@/pages/Settings"), "Settings");
const Audit = lazyPage(() => import("@/pages/Audit"), "Audit");
const Tickets = lazyPage(() => import("@/pages/Tickets"), "Tickets");
const Help = lazyPage(() => import("@/pages/Help"), "Help");
const Chat = lazyPage(() => import("@/pages/Chat"), "Chat");
const SupportDesk = lazyPage(() => import("@/pages/desk/SupportDesk"), "SupportDesk");
const AskAI = lazyPage(() => import("@/pages/AskAI"), "AskAI");
const MySite = lazyPage(() => import("@/pages/MySite"), "MySite");
const Orders = lazyPage(() => import("@/pages/Orders"), "Orders");
const Invoices = lazyPage(() => import("@/pages/Invoices"), "Invoices");
const InvoiceView = lazyPage(() => import("@/pages/InvoiceView"), "InvoiceView");
const ReceiptView = lazyPage(() => import("@/pages/ReceiptView"), "ReceiptView");
const Inventory = lazyPage(() => import("@/pages/Inventory"), "Inventory");
const ImportHistory = lazyPage(() => import("@/pages/ImportHistory"), "ImportHistory");
const Billing = lazyPage(() => import("@/pages/Billing"), "Billing");
const ReceiptDesigner = lazyPage(() => import("@/pages/ReceiptDesigner"), "ReceiptDesigner");
const BusinessSite = lazyPage(() => import("@/pages/BusinessSite"), "BusinessSite");

// Owners/managers land on the dashboard; till-PIN staff land straight on the
// POS (speed matters at the till); account-login staff without a dashboard
// land on their own self-service home hub instead.
function Home() {
  const { can, session, activeBusiness } = useSession();
  if (can("dashboard_ops")) return <Navigate to="dashboard" replace />;
  // Till staff open on their business's own front screen when it has one (the
  // academy's fee desk), else the till.
  if (session?.mode === "till") return <Navigate to={typeMeta(activeBusiness?.typeKey).tillHome || "pos"} replace />;
  return <Navigate to="home" replace />;
}

// A business's own screens open only for that business: a poultry farm that
// types /app/academy lands back on its dashboard, not on a broken page.
function OnlyFor({ typeKey, children }: { typeKey: string; children: React.ReactNode }) {
  const { activeBusiness } = useSession();
  if (activeBusiness && activeBusiness.typeKey !== typeKey) return <Navigate to="/app/dashboard" replace />;
  return <>{children}</>;
}

// While a page outside the app's frame loads (landing, sign-in, the desk…):
// a quiet, empty screen in the page colour, rather than a flash of white.
function PageLoading() {
  return <div className="min-h-dvh bg-canvas" aria-busy="true" />;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/loyalty/:code" element={<LoyaltyCardView />} />
      <Route path="/s/:slug" element={<BusinessSite />} />
      <Route path="/i/:token" element={<InvoiceView />} />
      <Route path="/r/:token" element={<ReceiptView />} />
      {/* StarTrack's support desk: its own frame, apart from the console. */}
      <Route path="/desk" element={<RequirePlatform><SupportDesk /></RequirePlatform>} />
      <Route path="/desk/:view" element={<RequirePlatform><SupportDesk /></RequirePlatform>} />
      <Route
        path="/admin"
        element={
          <RequirePlatform>
            <AdminShell />
          </RequirePlatform>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path=":tab" element={<Platform />} />
      </Route>
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="home" element={<StaffHome />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="all-stores" element={<FeatureGate feature="multiStore"><AllStores /></FeatureGate>} />
        <Route path="pos" element={<POS />} />
        <Route path="sales" element={<Sales />} />
        <Route path="products" element={<Products />} />
        <Route path="stock-in" element={<StockIn />} />
        <Route path="transfers" element={<FeatureGate feature="transfers"><Transfers /></FeatureGate>} />
        <Route path="returns" element={<FeatureGate feature="returns"><Returns /></FeatureGate>} />
        <Route path="jobs" element={<FeatureGate feature="verticals"><Jobs /></FeatureGate>} />
        {/* Each business's own screens (public/businesses/<key>/ui.ts), open only to that business. */}
        {BUSINESS_UIS.flatMap((ui) =>
          ui.routes.map(({ path, feature, Page }) => (
            <Route
              key={`${ui.key}:${path}`}
              path={path}
              element={<OnlyFor typeKey={ui.key}>{feature ? <FeatureGate feature={feature}><Page /></FeatureGate> : <Page />}</OnlyFor>}
            />
          ))
        )}
        <Route path="suppliers" element={<FeatureGate feature="suppliers"><Suppliers /></FeatureGate>} />
        <Route path="stock-count" element={<FeatureGate feature="stockCount"><StockCount /></FeatureGate>} />
        <Route path="businesses" element={<MyBusinesses />} />
        <Route path="platform" element={<Navigate to="/admin" replace />} />
        <Route path="customers" element={<Customers />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="staff" element={<Staff />} />
        <Route path="attendance" element={<FeatureGate feature="attendance"><Attendance /></FeatureGate>} />
        <Route path="activity" element={<Activity />} />
        <Route path="settings" element={<Settings />} />
        <Route path="billing" element={<Billing />} />
        <Route path="receipt" element={<FeatureGate feature="receiptCustom"><ReceiptDesigner /></FeatureGate>} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="import-history" element={<FeatureGate feature="csvImport"><ImportHistory /></FeatureGate>} />
        <Route path="invoices" element={<FeatureGate feature="invoices"><Invoices /></FeatureGate>} />
        <Route path="orders" element={<FeatureGate feature="sitePage"><Orders /></FeatureGate>} />
        <Route path="my-site" element={<FeatureGate feature="sitePage"><MySite /></FeatureGate>} />
        <Route path="audit" element={<FeatureGate feature="auditLog"><Audit /></FeatureGate>} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="help" element={<Help />} />
        <Route path="chat" element={<Chat />} />
        <Route path="ask-ai" element={<FeatureGate feature="ai"><AskAI /></FeatureGate>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
