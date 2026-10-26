import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from "react-native";
import * as Crypto from "expo-crypto";
import { request, ApiError, downloadInvoice } from "./api";
import InvoiceList from "./components/InvoiceList";
import { colors } from "./theme";
import { validateGoodsReceipt } from "./goodsReceipt";
import PurchasesSalesDashboard from "./components/PurchasesSalesDashboard";
import ManagementReports from "./components/ManagementReports";
import PrimaryOrderForm from "./components/PrimaryOrderForm";
import PortalFrame from "./components/PortalFrame";
import BrandLogo from "./components/BrandLogo";
import { MetricCard, MenuItem } from "./components/Workspace";
import {
  Session,
  Pending,
  readSession,
  saveSession,
  readSnapshot,
  saveSnapshot,
  readPending,
  savePending,
} from "./storage";

type Row = Record<string, any>;
type Snapshot = {
  distributor: Row;
  retrievedAt: string;
  truncatedLists: string[];
  [key: string]: any;
};
/**
 * Format a Salesforce monetary value as rupees with two decimal places.
 */
const money = (value: any) => `₹${Number(value || 0).toFixed(2)}`;
/**
 * Total the specified numeric field across the supplied snapshot rows.
 */
const sum = (rows: Row[], field: string) =>
  rows.reduce((total, row) => total + Number(row[field] || 0), 0);

/**
 * Render a labeled input with a visible placeholder and the requested keyboard/multiline
 * behavior.
 */
function Field({
  label,
  value,
  onChange,
  numeric = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor="#607970"
        keyboardType={numeric ? "numeric" : "default"}
        autoCapitalize="none"
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 90, textAlignVertical: "top" }]}
      />
    </View>
  );
}
/**
 * Render an accessible primary or secondary action while honoring its disabled state.
 */
function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.secondary, disabled && { opacity: 0.5 }]}
    >
      <Text style={[styles.buttonText, secondary && { color: "#19463e" }]}>{title}</Text>
    </Pressable>
  );
}
/**
 * Wrap related workspace content in the shared card styling.
 */
const Card = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.card}>{children}</View>
);

/**
 * Coordinate distributor sign-in, account-scoped snapshots, the persistent outbox and portal
 * screens; server responses remain authoritative for saved transactions.
 */
export default function DmsApp() {
  const [session, setSession] = useState<Session | null>(null),
    [data, setData] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<Pending[]>([]),
    [tab, setTab] = useState("Home");
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [offline, setOffline] = useState(false);
  const [subject, setSubject] = useState(""),
    [category, setCategory] = useState("Product"),
    [description, setDescription] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({}),
    [receipt, setReceipt] = useState<Row | null>(null);
  const [cases, setCases] = useState(""),
    [batch, setBatch] = useState(""),
    [expiry, setExpiry] = useState("");
  const [confirm, setConfirm] = useState<{
    label: string;
    path: string;
    body: Record<string, unknown>;
    replacesKey?: string;
  } | null>(null);
  const lock = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  // Retain the distributor identity and queue while showing the original login.
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [receiptError, setReceiptError] = useState("");
  const [savedReceiptId, setSavedReceiptId] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [returnType, setReturnType] = useState<"Primary" | "Secondary">("Primary");
  // Ignore late UI results from a session that has been signed out/replaced.
  const sessionGeneration = useRef(0);
  const logoutLock = useRef(false);
  const showSignIn = !session || needsSignIn;
  useEffect(() => {
    if (!resendSeconds) return;
    const timer = setTimeout(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);
  const lastReports = useRef<{ id: string; value: any; at: number } | null>(null);
  // Do not repeatedly lock the outbox while the user is preparing/reviewing an order.
  // Manual refresh and the sync after an explicit confirmation still use the same lock.
  const editingPrimary = useRef(false);
  editingPrimary.current = placingOrder || confirm?.path === "/primary/orders";

  useEffect(() => {
    void readSession()
      .then(async (saved) => {
        if (saved) {
          setOffline(true);
          setSession(saved);
          setData(await readSnapshot(saved.id));
          setPending(await readPending(saved.id));
        }
      })
      .catch(() => setNotice("Could not load this device’s saved session."));
  }, []);
  /**
   * Replay pending distributor commands in order and refresh the Salesforce snapshot. Stop at
   * rejected work and ignore results from an obsolete session generation.
   */
  async function sync(current = session, refreshReports = true) {
    if (!current || lock.current || logoutLock.current) return;
    const generation = sessionGeneration.current;
    /**
     * Check that the asynchronous operation still belongs to the active distributor session
     * generation.
     */
    const isCurrent = () => generation === sessionGeneration.current;
    lock.current = true;
    setBusy(true);
    try {
      const queue = await readPending(current.id);
      if (!isCurrent()) return;
      while (queue.length) {
        const first = queue[0];
        if (first.status === 400) break;
        try {
          const saved = await request(first.path, current.token, first.body);
          if (
            isCurrent() &&
            first.body.action === "receiveGoods" &&
            saved?.status === "Received" &&
            saved?.id
          )
            setSavedReceiptId(saved.id);
          queue.shift();
          await savePending(current.id, queue);
          if (!isCurrent()) return;
          setPending([...queue]);
        } catch (error: any) {
          first.error = error.message;
          first.status = error.status;
          await savePending(current.id, queue);
          if (!isCurrent()) return;
          setPending([...queue]);
          if (error.status === 400) break;
          throw error;
        }
      }
      const snapshot = await request("/overview", current.token);
      if (!isCurrent()) return;
      // Reports are heavier than activity lists. Refresh at least once per minute.
      try {
        if (
          refreshReports ||
          lastReports.current?.id !== current.id ||
          Date.now() - lastReports.current.at > 60000
        ) {
          const reports = await request("/reports", current.token);
          if (!isCurrent()) return;
          lastReports.current = {
            id: current.id,
            value: reports,
            at: Date.now(),
          };
        }
        snapshot.reports = lastReports.current?.value;
      } catch (error: any) {
        const cached = await readSnapshot(current.id);
        if (!isCurrent()) return;
        snapshot.reports = cached?.reports;
        snapshot.reportError = `Reports could not refresh: ${error.message}. Any report shown is the last saved calculation.`;
      }
      await saveSnapshot(current.id, snapshot);
      if (!isCurrent()) return;
      setData(snapshot);
      setOffline(false);
      setNotice(
        queue.length
          ? `Not saved: ${queue[0].label}. ${queue[0].error || "Pending synchronization."} Open More → Sync centre to review.`
          : "Salesforce data refreshed.",
      );
    } catch (error: any) {
      if (!isCurrent()) return;
      setOffline(true);
      setNotice(error.message);
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setNeedsSignIn(true);
        setNotice(
          "Your session needs renewal. Sign in with the same distributor email; queued work stays linked to that distributor.",
        );
      }
    } finally {
      lock.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  useEffect(() => {
    if (!session || needsSignIn) return;
    void sync(session);
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && !editingPrimary.current) void sync(session, false);
    }, 20000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active" && !editingPrimary.current) void sync(session);
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [session?.id, session?.token, needsSignIn]);
  /**
   * Request/resend a distributor code or verify it, persist the session and restore only that
   * distributor snapshot and pending queue.
   */
  async function login(resend = false) {
    if (busy) return;
    if ((!sent || resend) && resendSeconds > 0) return;
    setBusy(true);
    try {
      if (!sent || resend) {
        await request("/auth/request-code", "", { email });
        setSent(true);
        setCode("");
        setResendSeconds(60);
        setNotice(
          "Code requested. If this email matches an active distributor, Salesforce has accepted a new code email. Check Inbox and Spam. Use only the latest code; it expires in 10 minutes.",
        );
      } else {
        const result = await request("/auth/verify-code", "", { email, code });
        if (session && session.id !== result.user.id && (await readPending(session.id)).length)
          throw new Error("Renew with the same distributor email while changes are pending.");
        const current: Session = {
          token: result.token,
          id: result.user.id,
          name: result.user.name,
          expiresAt: Date.now() + 8 * 3600_000,
        };
        await saveSession(current);
        sessionGeneration.current++;
        setData(await readSnapshot(current.id));
        setPending(await readPending(current.id));
        lastReports.current = null;
        setOffline(true);
        setNeedsSignIn(false);
        setSavedReceiptId("");
        setTab("Home");
        setSession(current);
        setCode("");
        setSent(false);
        setNotice("Signed in. Refreshing Salesforce data…");
      }
    } catch (error: any) {
      setNotice(
        error instanceof ApiError && error.status === 429
          ? "Too many code requests. If you already received a code, choose ‘I already received a code’ below. Otherwise wait before requesting another."
          : error.message,
      );
    } finally {
      setBusy(false);
    }
  }
  /**
   * Persist the confirmed command with a stable request key before sending; allow correction
   * only of the matching rejected goods receipt.
   */
  async function enqueue() {
    if (!session || !confirm || lock.current || logoutLock.current) return;
    const generation = sessionGeneration.current;
    lock.current = true;
    setBusy(true);
    try {
      const queue = await readPending(session.id);
      const replaceIndex = confirm.replacesKey
        ? queue.findIndex((item) => item.key === confirm.replacesKey)
        : -1;
      if (
        confirm.replacesKey &&
        (replaceIndex < 0 ||
          queue[replaceIndex].status !== 400 ||
          queue[replaceIndex].body.action !== "receiveGoods" ||
          queue[replaceIndex].body.recordId !== confirm.body.recordId)
      )
        throw new Error(
          "This rejected receipt has changed. Refresh and review it again before saving.",
        );
      const key = confirm.replacesKey || Crypto.randomUUID();
      // Persist before sending. A lost response can safely retry the same request key.
      const updated = {
        key,
        path: confirm.path,
        label: confirm.label,
        body: { ...confirm.body, requestKey: key },
      };
      if (replaceIndex >= 0) queue[replaceIndex] = updated;
      else queue.push(updated);
      await savePending(session.id, queue);
      if (generation !== sessionGeneration.current) return;
      setPending(queue);
      setConfirm(null);
      setReceipt(null);
      if (confirm.path === "/primary/orders") setPlacingOrder(false);
      if (confirm.path === "/tickets") {
        setSubject("");
        setDescription("");
      }
      setNotice("Saved on this device. Awaiting Salesforce confirmation.");
    } catch {
      if (generation === sessionGeneration.current)
        setNotice("Could not save on this device. Nothing was submitted.");
    } finally {
      lock.current = false;
      if (generation === sessionGeneration.current) setBusy(false);
    }
    if (generation === sessionGeneration.current) await sync();
  }
  /**
   * Remove distributor credentials and clear visible account state while preserving
   * account-keyed snapshots and pending work for the same distributor to resume.
   */
  async function logout() {
    if (!session || logoutLock.current) return;
    logoutLock.current = true;
    setLoggingOut(true);
    sessionGeneration.current++;
    try {
      // Remove credentials only. Snapshot/outbox remain keyed by distributor ID.
      // An already-sent request may finish, but cannot update another login's UI.
      await saveSession(null);
      setSession(null);
      setNeedsSignIn(false);
      setData(null);
      setPending([]);
      setSavedReceiptId("");
      setReceiptError("");
      lastReports.current = null;
      setEmail("");
      setCode("");
      setSent(false);
      setResendSeconds(0);
      setConfirm(null);
      setReceipt(null);
      setCases("");
      setBatch("");
      setExpiry("");
      setSubject("");
      setDescription("");
      setCategory("Product");
      setNotes({});
      setPlacingOrder(false);
      setTab("Home");
      setOffline(false);
      setNotice(
        "Signed out. Any pending changes remain saved for the previous distributor. Sign in to that same account to sync them.",
      );
    } catch {
      setNotice("Could not remove the saved sign-in from this device. Please try Log out again.");
    } finally {
      setBusy(false);
      logoutLock.current = false;
      setLoggingOut(false);
    }
  }
  /**
   * Validate required rejection notes and open a confirmation for the selected workflow
   * decision; confirmation performs the queue write.
   */
  function decide(row: Row, action: string, decision: string) {
    if (decision === "Rejected" && !notes[row.Id]?.trim()) {
      setNotice("Enter a rejection reason first.");
      return;
    }
    setConfirm({
      label: `${decision === "Approved" ? "Approve" : "Reject"} ${row.Name}`,
      path: "/transactions",
      body: { action, recordId: row.Id, decision, notes: notes[row.Id] || "" },
    });
  }
  /**
   * Return a named snapshot collection, falling back to an empty list before data is loaded.
   */
  const rows = (name: string): Row[] => data?.[name] || [];
  /**
   * Check whether the local outbox already contains work for the selected record.
   */
  const hasPending = (id: string) => pending.some((item) => item.body.recordId === id);
  /**
   * Find a rejected paid/free receipt request for the specified line so its fields can be
   * corrected.
   */
  const rejectedReceipt = (id: string, kind: string) =>
    pending.find(
      (item) =>
        item.status === 400 &&
        item.body.action === "receiveGoods" &&
        item.body.recordId === id &&
        (item.body.receiptKind || "Paid") === kind,
    );
  /**
   * Open the receipt editor and restore rejected quantities, batch and expiry when correcting an
   * earlier request.
   */
  function openReceipt(line: Row, kind: string) {
    const rejected = rejectedReceipt(line.Id, kind);
    setReceipt({ ...line, receiptKind: kind, correctionKey: rejected?.key });
    setCases(rejected ? String(rejected.body.cases ?? "") : "");
    setBatch(rejected ? String(rejected.body.batch ?? "") : "");
    setExpiry(rejected ? String(rejected.body.expiry ?? "") : "");
    setReceiptError(rejected?.error || "");
    setConfirm(null);
    setTab("Primary");
  }
  /**
   * Render decision notes and actions for workflows that still require a distributor decision,
   * disabling duplicates while queued.
   */
  const decisionButtons = (row: Row, action: string) => (
    <>
      <Field
        label="Decision notes — required for rejection"
        value={notes[row.Id] || ""}
        onChange={(value) => setNotes((old) => ({ ...old, [row.Id]: value }))}
      />
      <Button
        title={hasPending(row.Id) ? "Decision waiting to sync" : "Approve"}
        disabled={busy || hasPending(row.Id)}
        onPress={() => decide(row, action, "Approved")}
      />
      <Button
        title="Reject"
        secondary
        disabled={busy || hasPending(row.Id)}
        onPress={() => decide(row, action, "Rejected")}
      />
    </>
  );
  return (
    <SafeAreaView style={styles.safe}>
      <PortalFrame
        signedIn={!showSignIn}
        tab={tab}
        name={session?.name || "Distributor"}
        pending={pending.length}
        busy={busy}
        loggingOut={loggingOut}
        onSelect={setTab}
        onRefresh={() => void sync()}
        onLogout={() => void logout()}
      >
        <ScrollView
          ref={scrollRef}
          key={showSignIn ? "login" : tab}
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          {(showSignIn || tab === "Home") && (
            <View style={[styles.header, showSignIn && styles.loginHero]}>
              {showSignIn && (
                <View style={{ marginBottom: 20 }}>
                  <BrandLogo width={132} />
                </View>
              )}
              <Text style={styles.eyebrow}>
                {showSignIn ? "DISTRIBUTOR PORTAL" : "DISTRIBUTOR HUB"}
              </Text>
              <Text style={styles.title}>
                {showSignIn ? "Your distribution workspace" : session?.name}
              </Text>
              <Text style={styles.white}>
                {!showSignIn
                  ? "Orders · Stock · Support"
                  : "Manage your orders, monitor stock and stay connected to your outlets."}
              </Text>
              {!showSignIn && (
                <View style={styles.heroFooter}>
                  <Text style={styles.white}>
                    Company officer: {data?.distributor.Officer__r?.Name || "Not assigned"}
                  </Text>
                  <Text style={styles.date}>
                    {new Date().toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Text>
                </View>
              )}
            </View>
          )}
          {!!notice && (
            <Text accessibilityRole="alert" style={styles.notice}>
              {notice}
            </Text>
          )}
          {!showSignIn && offline && tab !== "Sync" && (
            <Button
              title="Open sync and sign-in"
              secondary
              disabled={busy}
              onPress={() => setTab("Sync")}
            />
          )}
          {showSignIn ? (
            <View style={[styles.card, styles.loginCard, !!notice && { marginTop: 0 }]}>
              <Text style={styles.heading}>Distributor sign in</Text>
              <Text style={styles.copy}>
                Use the email linked to your distributor record in Salesforce.
              </Text>
              <Field label="Distributor login email" value={email} onChange={setEmail} />
              {sent && <Field label="Six-digit code" value={code} onChange={setCode} numeric />}
              <Button
                title={
                  busy
                    ? "Please wait…"
                    : sent
                      ? "Verify and sign in"
                      : resendSeconds > 0
                        ? `Request a new code in ${resendSeconds}s`
                        : "Email my sign-in code"
                }
                disabled={busy || (!sent && resendSeconds > 0)}
                onPress={() => void login()}
              />
              {!sent && (
                <Button
                  title="I already received a code"
                  secondary
                  disabled={busy}
                  onPress={() => {
                    setSent(true);
                    setNotice(
                      "Enter your distributor email and the latest six-digit code from your inbox. Codes expire after 10 minutes.",
                    );
                  }}
                />
              )}
              {sent && (
                <Button
                  title={resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Send a new code"}
                  secondary
                  disabled={busy || resendSeconds > 0}
                  onPress={() => void login(true)}
                />
              )}
              {sent && (
                <Button
                  title="Change email address"
                  secondary
                  disabled={busy}
                  onPress={() => {
                    setSent(false);
                    setCode("");
                  }}
                />
              )}
              <Text style={styles.security}>
                Your sign-in gives access only to your distributor’s records. A connection is
                required to receive your code.
              </Text>
            </View>
          ) : (
            <>
              {tab !== "Home" && (
                <Text style={styles.screenTitle}>
                  {["Primary", "Secondary"].includes(tab)
                    ? "Orders"
                    : tab === "Inventory"
                      ? "Inventory"
                      : tab === "Sync"
                        ? "Sync centre"
                        : tab}
                </Text>
              )}
              <View style={styles.syncBar}>
                <Text style={styles.syncText}>
                  {offline ? "Offline / last saved data" : "Salesforce snapshot"}
                  {data ? ` · ${new Date(data.retrievedAt).toLocaleString()}` : ""} ·{" "}
                  {pending.length} pending
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Refresh and sync"
                  disabled={busy}
                  onPress={() => void sync()}
                  style={styles.refresh}
                >
                  <Text style={styles.refreshText}>{busy ? "Syncing…" : "↻ Sync"}</Text>
                </Pressable>
              </View>
              {tab === "Home" && (
                <Text style={styles.smallCopy}>
                  SFA records refresh automatically while this app is open and online. Offline
                  drafts appear after the employee syncs them to Salesforce.
                </Text>
              )}
              {["Primary", "Secondary"].includes(tab) && (
                <View style={styles.tabs}>
                  {["Primary", "Secondary"].map((name) => (
                    <Pressable
                      key={name}
                      accessibilityRole="button"
                      accessibilityState={{ selected: tab === name }}
                      onPress={() => setTab(name)}
                      style={[styles.tab, tab === name && styles.selected]}
                    >
                      <Text style={{ color: tab === name ? "white" : "#19463e" }}>
                        {name} orders
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {tab === "Invoices" && session && <InvoiceList owner={session.id} load={path => request(path, session.token)} download={(id, name) => downloadInvoice(id, name, session.token)} />}
              {tab === "More" && (
                <>
                  <Text style={styles.copy}>Manage your distribution workspace</Text>
                  <MenuItem title="Invoices" description="Approved orders, products and invoice PDFs" icon="▤" onPress={() => setTab("Invoices")} />
                  <MenuItem
                    title="Dashboard and reports"
                    description={
                      Platform.OS === "web"
                        ? "Beat productivity, outlet coverage and stock"
                        : "Sales targets, beat productivity, coverage and stock"
                    }
                    icon="▥"
                    onPress={() => setTab("Reports")}
                  />
                  <MenuItem
                    title="Outlet assets"
                    description="Asset records captured by employees in SFA"
                    icon="▣"
                    onPress={() => setTab("Assets")}
                  />
                  <MenuItem
                    title="Returns"
                    description="Primary and secondary returns"
                    icon="↩"
                    onPress={() => setTab("Returns")}
                  />
                  <MenuItem
                    title="Support tickets"
                    description="Raise a request and view updates"
                    icon="☷"
                    onPress={() => setTab("Tickets")}
                  />
                  <MenuItem
                    title="Stock checks"
                    description="View outlet stock observations"
                    icon="▦"
                    onPress={() => setTab("Stock checks")}
                  />
                  <MenuItem
                    title="Sync centre"
                    description={`${pending.length} pending changes · review connection and sync`}
                    icon="↻"
                    onPress={() => setTab("Sync")}
                  />
                  <Button
                    title={loggingOut ? "Signing out…" : "Log out"}
                    secondary
                    disabled={loggingOut}
                    onPress={() => void logout()}
                  />
                </>
              )}
              {data &&
                !offline &&
                ["Primary", "Secondary", "Inventory", "Outlets", "Stock checks", "Assets"].includes(
                  tab,
                ) &&
                !rows(
                  (
                    {
                      Primary: "primaryOrders",
                      Secondary: "secondaryOrders",
                      Inventory: "inventory",
                      Outlets: "outlets",
                      "Stock checks": "stockChecks",
                      Assets: "assets",
                    } as Record<string, string>
                  )[tab],
                ).length && (
                  <Text style={styles.notice}>
                    No {tab.toLowerCase()} records are currently linked to this distributor in
                    Salesforce.
                  </Text>
                )}
              {confirm && confirm.path !== "/primary/orders" && (
                <Card>
                  <Text style={styles.heading}>Confirm: {confirm.label}</Text>
                  <Text>
                    The request will be saved locally, then submitted to Salesforce. It is not
                    complete until Salesforce confirms it.
                  </Text>
                  <Button title="Confirm and save" disabled={busy} onPress={() => void enqueue()} />
                  <Button
                    title="Cancel"
                    secondary
                    disabled={busy}
                    onPress={() => setConfirm(null)}
                  />
                </Card>
              )}
              {!!data?.truncatedLists?.length && (
                <Text style={styles.notice}>
                  Some lists show only the latest 200 records: {data.truncatedLists.join(", ")}.
                  List counts and the order pipeline cover downloaded records only. Purchased vs
                  sold is aggregated separately across posted records.
                </Text>
              )}
              {tab === "Home" && (
                <>
                  {!!data?.reportError && <Text style={styles.notice}>{data.reportError}</Text>}
                  <ManagementReports data={data?.reports} onOpen={() => setTab("Reports")} />
                  <PurchasesSalesDashboard data={data?.dashboard} />
                  <Text style={styles.screenTitle}>Business overview</Text>
                  <Text style={styles.copy}>Summary of the records in your latest download</Text>
                  <View style={styles.metricGrid}>
                    <MetricCard
                      icon="▤"
                      label="Primary orders"
                      value={data ? rows("primaryOrders").length : "—"}
                    />
                    <MetricCard
                      icon="◷"
                      label="Approved outlet orders"
                      value={
                        data
                          ? rows("secondaryOrders").filter(
                              (row) => row.DMS_Status__c === "Approved",
                            ).length
                          : "—"
                      }
                    />
                    <MetricCard
                      icon="◎"
                      label="Linked outlets"
                      value={data ? rows("outlets").length : "—"}
                    />
                    <MetricCard
                      icon="▦"
                      label="Low-stock batches"
                      value={
                        data ? rows("inventory").filter((row) => row.Low_Stock__c).length : "—"
                      }
                    />
                  </View>
                  <Card>
                    <Text style={styles.sectionLabel}>PRIMARY ORDER PIPELINE</Text>
                    <Text style={styles.amount}>
                      {data
                        ? money(
                            sum(
                              rows("primaryOrders").filter((row) => row.Status__c !== "Rejected"),
                              "Total_Amount__c",
                            ),
                          )
                        : "—"}
                    </Text>
                    <Text style={styles.smallCopy}>
                      Value of non-rejected orders in the downloaded list. This is not received
                      stock or sales revenue.
                    </Text>
                  </Card>
                  <Text style={styles.heading}>Quick actions</Text>
                  <MenuItem
                    title="View outlet orders"
                    description="View automatically approved secondary orders"
                    icon="▤"
                    onPress={() => setTab("Secondary")}
                  />
                  <MenuItem
                    title="Check inventory"
                    description={
                      data
                        ? `${rows("inventory").filter((row) => row.Expired__c).length} expired batches · review stock availability`
                        : "Review stock availability and expiry"
                    }
                    icon="▦"
                    onPress={() => setTab("Inventory")}
                  />
                </>
              )}
              {tab === "Primary" && (
                <>
                  <Button
                    title={placingOrder ? "Close order form" : "Place Primary Order"}
                    disabled={loggingOut || !!confirm}
                    onPress={() => setPlacingOrder(!placingOrder)}
                  />
                  {placingOrder && (
                    <PrimaryOrderForm
                      token={session.token}
                      disabled={loggingOut || !!confirm}
                      onSignIn={() => {
                        setOffline(true);
                        setNeedsSignIn(true);
                      }}
                      onReview={(body, summary) => {
                        setConfirm({
                          label: `Submit to ${data?.distributor.Officer__r?.Name || "company officer"}: ${summary}`,
                          path: "/primary/orders",
                          body,
                        });
                      }}
                    />
                  )}
                  <Text style={styles.heading}>Primary orders — distributor and employee</Text>
                  {rows("primaryOrders").map((row) => (
                    <Card key={row.Id}>
                      <Text style={styles.heading}>
                        {row.Name} · {row.Status__c}
                      </Text>
                      <Text>
                        {row.Order_Source__c === "Distributor DMS"
                          ? "Placed by distributor"
                          : row.Employee__r?.Name || "Employee SFA"}{" "}
                        · {money(row.Total_Amount__c)}
                      </Text>
                      {row.Order_Lines__r?.records?.map((line: Row) => (
                        <View key={line.Id}>
                          <Text style={styles.label}>
                            {line.Product__r?.Name}: {line.Cases__c} cases ×{" "}
                            {money(line.Case_Price__c)}
                          </Text>
                          <Text>
                            {line.Pieces_Per_Case__c} pieces per case · Net{" "}
                            {money(line.Net_Amount__c)}
                          </Text>
                          {!!line.Scheme__r?.Name && (
                            <Text style={styles.label}>
                              Scheme: {line.Scheme__r.Name} · Discount{" "}
                              {money(line.Discount_Amount__c)} · {line.Free_Cases__c || 0} free
                              cases of {line.Free_Product__r?.Name || line.Product__r?.Name}
                            </Text>
                          )}
                          {!!line.Free_Gift__c && (
                            <Text>
                              Gift: {line.Free_Gift__c} × {line.Gift_Quantity__c || 0}
                            </Text>
                          )}
                          {row.Status__c === "Approved" && (
                            <Button
                              title={
                                rejectedReceipt(line.Id, "Paid")
                                  ? "Correct rejected receipt"
                                  : "Receive goods for this line"
                              }
                              secondary
                              disabled={
                                loggingOut ||
                                (hasPending(line.Id) && !rejectedReceipt(line.Id, "Paid"))
                              }
                              onPress={() => openReceipt(line, "Paid")}
                            />
                          )}
                          {row.Status__c === "Approved" && Number(line.Free_Cases__c) > 0 && (
                            <Button
                              title={
                                rejectedReceipt(line.Id, "Free")
                                  ? "Correct rejected free receipt"
                                  : `Receive free cases — ${line.Free_Product__r?.Name || line.Product__r?.Name}`
                              }
                              secondary
                              disabled={
                                loggingOut ||
                                (hasPending(line.Id) && !rejectedReceipt(line.Id, "Free"))
                              }
                              onPress={() => openReceipt(line, "Free")}
                            />
                          )}
                        </View>
                      ))}
                    </Card>
                  ))}
                  {receipt && (
                    <View
                      key={`${receipt.Id}-${receipt.receiptKind}`}
                      onLayout={() => scrollRef.current?.scrollToEnd({ animated: true })}
                    >
                      <Card>
                        <Text style={styles.heading}>
                          {receipt.receiptKind} goods receipt:{" "}
                          {receipt.receiptKind === "Free"
                            ? receipt.Free_Product__r?.Name
                            : receipt.Product__r?.Name}
                        </Text>
                        {!!receipt.correctionKey && (
                          <Text style={styles.notice}>
                            Correct the details below. Your rejected request stays saved until you
                            confirm its replacement. No duplicate request will be added.
                          </Text>
                        )}
                        <Text style={styles.label}>
                          Approved {receipt.receiptKind === "Free" ? "free" : "paid"} quantity:{" "}
                          {Number(
                            receipt.receiptKind === "Free"
                              ? receipt.Free_Cases__c
                              : receipt.Cases__c,
                          ) || 0}{" "}
                          case(s).
                        </Text>
                        <Text style={styles.smallCopy}>
                          Enter the actual delivered cases, not pieces. Previous receipts reduce the
                          remaining quantity; Salesforce checks this again when saving.
                        </Text>
                        <Field
                          label="Received cases — whole number"
                          value={cases}
                          onChange={setCases}
                          numeric
                        />
                        <Field label="Batch number" value={batch} onChange={setBatch} />
                        <Field
                          label="Expiry date (YYYY-MM-DD or DD-MM-YYYY)"
                          value={expiry}
                          onChange={setExpiry}
                        />
                        <Text style={styles.smallCopy}>
                          Example: 2026-12-14 or 14-12-2026. Review first, then Confirm and save to
                          create the receipt in Salesforce.
                        </Text>
                        {!!receiptError && (
                          <Text accessibilityRole="alert" style={styles.notice}>
                            {receiptError}
                          </Text>
                        )}
                        <Button
                          title="Review goods receipt"
                          disabled={loggingOut}
                          onPress={() => {
                            const validated = validateGoodsReceipt(
                              cases,
                              batch,
                              expiry,
                              Number(
                                receipt.receiptKind === "Free"
                                  ? receipt.Free_Cases__c
                                  : receipt.Cases__c,
                              ),
                            );
                            if (!validated.value) {
                              setReceiptError(validated.error || "Check the receipt details.");
                              return;
                            }
                            setReceiptError("");
                            setExpiry(validated.value.expiry);
                            setConfirm({
                              label: `Receive ${validated.value.cases} case(s), batch ${validated.value.batch}, expiry ${validated.value.expiry} and increase stock`,
                              path: "/transactions",
                              replacesKey: receipt.correctionKey,
                              body: {
                                action: "receiveGoods",
                                receiptKind: receipt.receiptKind,
                                recordId: receipt.Id,
                                ...validated.value,
                              },
                            });
                            scrollRef.current?.scrollTo({ y: 0, animated: true });
                          }}
                        />
                      </Card>
                    </View>
                  )}
                  <Text style={styles.heading}>Goods receipts saved in Salesforce</Text>
                  {!!savedReceiptId && (
                    <Text style={styles.notice}>
                      Salesforce confirmed receipt{" "}
                      {rows("receipts").find((row) => row.Id === savedReceiptId)?.Name ||
                        savedReceiptId}
                      . Open Goods Receipts → All Goods Receipts in Salesforce to view it.
                    </Text>
                  )}
                  {rows("receipts").map((row) => (
                    <Card key={row.Id}>
                      <Text style={styles.heading}>
                        {row.Name} · {row.Status__c}
                      </Text>
                      <Text>
                        {row.Received_Date__c || "Not received yet"} · {row.Total_Pieces__c || 0}{" "}
                        pieces · {money(row.Total_Value__c)}
                      </Text>
                    </Card>
                  ))}
                </>
              )}
              {tab === "Secondary" &&
                rows("secondaryOrders").map((row) => (
                  <Card key={row.Id}>
                    <Text style={styles.heading}>
                      {row.Name} · {row.DMS_Status__c || "Pending"}
                    </Text>
                    <Text>
                      {row.Retailer__r?.Name} · {money(row.Total_Amount__c)}
                    </Text>
                    {row.lines?.map((line: Row) => (
                      <Text key={line.Id} style={styles.label}>
                        {line.Product__r?.Name}: {line.Piece_Quantity__c} pieces ·{" "}
                        {money(line.Line_Amount__c)}
                      </Text>
                    ))}
                    <Text>
                      {row.DMS_Decision_Notes__c ||
                        (row.DMS_Status__c === "Approved"
                          ? "Approved in Salesforce."
                          : row.DMS_Status__c === "Rejected"
                            ? "Previously rejected order."
                            : "Awaiting Salesforce automatic approval. Refresh to check the saved status.")}
                    </Text>
                  </Card>
                ))}
              {tab === "Returns" && (
                <>
                  <View style={styles.tabs}>
                    {(["Primary", "Secondary"] as const).map((kind) => (
                      <Pressable
                        key={kind}
                        accessibilityRole="button"
                        accessibilityLabel={kind + " returns"}
                        accessibilityState={{ selected: returnType === kind }}
                        onPress={() => setReturnType(kind)}
                        style={[styles.tab, returnType === kind && styles.selected]}
                      >
                        <Text style={{ color: returnType === kind ? "white" : "#19463e" }}>
                          {kind} returns
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {returnType === "Secondary" && (
                    <>
                      <Text style={styles.heading}>Secondary returns — outlets to distributor</Text>
                      <Text style={styles.copy}>
                        Outlet returns recorded in pieces. Distributor approval applies.
                      </Text>
                      {data && rows("returns").length === 0 && (
                        <Text style={styles.notice}>
                          No secondary returns in the latest Salesforce download for this
                          distributor.
                        </Text>
                      )}
                      {rows("returns").map((row) => (
                        <Card key={row.Id}>
                          <Text style={styles.heading}>
                            {row.Name} · {row.DMS_Status__c}
                          </Text>
                          <Text>
                            {row.Outlet__r?.Name} · {row.Product__r?.Name} · {row.Quantity__c}{" "}
                            pieces
                          </Text>
                          <Text>{row.Return_Reason__c}</Text>
                          {(!row.DMS_Status__c || row.DMS_Status__c === "Pending") &&
                            decisionButtons(row, "returnDecision")}
                        </Card>
                      ))}
                    </>
                  )}
                  {returnType === "Primary" && (
                    <>
                      <Text style={styles.heading}>Primary returns — company officer approval</Text>
                      <Text style={styles.copy}>
                        Distributor returns to the manufacturing company, recorded in cases. The
                        Distributor Officer approves or rejects them.
                      </Text>
                      {data && rows("primaryReturns").length === 0 && (
                        <Text style={styles.notice}>
                          No primary returns in the latest Salesforce download for this distributor.
                        </Text>
                      )}
                      {rows("primaryReturns").map((row) => (
                        <Card key={row.Id}>
                          <Text>
                            {row.Name} · {row.Status__c}
                          </Text>
                          <Text>
                            {row.Employee__r?.Name} · {row.Total_Cases__c} cases ·{" "}
                            {money(row.Total_Amount__c)}
                          </Text>
                        </Card>
                      ))}
                    </>
                  )}
                </>
              )}
              {tab === "Reports" && (
                <>
                  {!!data?.reportError && <Text style={styles.notice}>{data.reportError}</Text>}
                  <ManagementReports data={data?.reports} detailed />
                </>
              )}
              {tab === "Assets" &&
                rows("assets").map((row) => (
                  <Card key={row.Id}>
                    <Text style={styles.heading}>{row.Asset_Name__c || row.Name}</Text>
                    <Text>Outlet: {row.Outlet__r?.Name || "Not assigned"}</Text>
                    <Text>Asset code: {row.Asset_Code__c || "Not recorded"}</Text>
                    <Text>Status: {row.Status__c || "Not recorded"}</Text>
                    <Text>Given date: {row.Given_Date__c || "Not recorded"}</Text>
                    <Text>Employee: {row.Visit__r?.Employee__r?.Name || "Not recorded"}</Text>
                  </Card>
                ))}
              {tab === "Inventory" &&
                rows("inventory").map((row) => (
                  <Card key={row.Id}>
                    <Text style={styles.heading}>{row.Product__r?.Name}</Text>
                    <Text>
                      Batch: {row.Batch_Number__c || "Not recorded"} · Expiry:{" "}
                      {row.Expiry_Date__c || "Not recorded"}
                    </Text>
                    <Text style={styles.metric}>
                      {row.Available_Pieces__c} available / {row.On_Hand_Pieces__c} on hand
                    </Text>
                    <Text>
                      {row.Expired__c
                        ? "EXPIRED — do not sell"
                        : row.Low_Stock__c
                          ? "LOW STOCK — replenishment needed"
                          : "Stock available"}
                    </Text>
                  </Card>
                ))}
              {tab === "Tickets" && (
                <>
                  <Card>
                    <Text style={styles.heading}>Raise a support ticket</Text>
                    <Text>Handled by your company officer / Salesforce administrator.</Text>
                    <Text style={styles.smallCopy}>
                      Open → In Progress (approved) → Closed (resolved), or Rejected with a reason.
                    </Text>
                    <View style={styles.tabs}>
                      {["Product", "Portal", "Delivery"].map((value) => (
                        <Button
                          key={value}
                          title={value}
                          secondary={category !== value}
                          onPress={() => setCategory(value)}
                        />
                      ))}
                    </View>
                    <Field label="Subject" value={subject} onChange={setSubject} />
                    <Field
                      label="Issue description"
                      value={description}
                      onChange={setDescription}
                      multiline
                    />
                    <Button
                      title="Review ticket"
                      disabled={busy}
                      onPress={() => {
                        if (!subject.trim() || !description.trim()) {
                          setNotice("Enter the subject and description.");
                          return;
                        }
                        setConfirm({
                          label: "Create support ticket",
                          path: "/tickets",
                          body: {
                            subject: subject.trim(),
                            category,
                            description: description.trim(),
                          },
                        });
                      }}
                    />
                  </Card>
                  {rows("tickets").map((row) => (
                    <Card key={row.Id}>
                      <Text style={styles.heading}>
                        {row.Name} · {row.Status__c}
                      </Text>
                      <Text>
                        {row.Category__c}: {row.Subject__c}
                      </Text>
                      <Text>{row.Description__c}</Text>
                      <Text style={styles.label}>
                        Officer: {row.Officer__r?.Name || "Not assigned"} ·{" "}
                        {row.Resolution__c || "Awaiting resolution"}
                      </Text>
                    </Card>
                  ))}
                  <Text style={styles.heading}>Outlet tickets from SFA</Text>
                  {rows("outletTickets").map((row) => (
                    <Card key={row.Id}>
                      <Text>
                        {row.Outlet__r?.Name}: {row.Subject__c}
                      </Text>
                      <Text>
                        {row.Status__c} · {row.Description__c}
                      </Text>
                    </Card>
                  ))}
                </>
              )}
              {tab === "Outlets" &&
                rows("outlets").map((row) => (
                  <Card key={row.Id}>
                    <Text style={styles.heading}>{row.Name}</Text>
                    <Text>Beat: {row.Beat__r?.Name || "Not assigned"}</Text>
                    <Text>{row.Active__c ? "Active" : "Inactive"}</Text>
                  </Card>
                ))}
              {tab === "Stock checks" &&
                rows("stockChecks").map((row) => (
                  <Card key={row.Id}>
                    <Text style={styles.heading}>{row.Outlet__r?.Name}</Text>
                    <Text>
                      {row.Product__r?.Name}: {row.Quantity__c} pieces
                    </Text>
                    <Text>{new Date(row.CreatedDate).toLocaleString()}</Text>
                  </Card>
                ))}
              {tab === "Sync" && (
                <Card>
                  <Text style={styles.heading}>Pending changes: {pending.length}</Text>
                  {pending.map((row) => (
                    <View key={row.key}>
                      <Text style={styles.label}>{row.label}</Text>
                      <Text>{row.error || "Waiting for connection"}</Text>
                      {row.status === 400 && (
                        <Button
                          title="Remove rejected request — then correct and resubmit"
                          secondary
                          disabled={busy}
                          onPress={() =>
                            void (async () => {
                              const remaining = (await readPending(session.id)).filter(
                                (item) => item.key !== row.key,
                              );
                              await savePending(session.id, remaining);
                              setPending(remaining);
                              setNotice(
                                "Removed only the request Salesforce rejected. No Salesforce record was deleted.",
                              );
                            })()
                          }
                        />
                      )}
                    </View>
                  ))}
                  <Text>
                    Queued work is scoped to your distributor. A rejected request remains here for
                    review; it is never shown as saved in Salesforce.
                  </Text>
                  {offline && (
                    <Button
                      title="Sign in again"
                      disabled={busy}
                      onPress={() => setNeedsSignIn(true)}
                    />
                  )}
                </Card>
              )}
              {!data && (
                <Text style={styles.notice}>
                  No Salesforce snapshot is available yet. Sign-in and the first data download
                  require a connection.
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </PortalFrame>
      <Modal
        visible={!showSignIn && confirm?.path === "/primary/orders"}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!busy) setConfirm(null); }}
      >
        <View style={styles.reviewOverlay}>
          <View style={styles.reviewDialog} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
              <Text accessibilityRole="header" style={styles.heading}>Review primary order</Text>
              <Text style={styles.copy}>{confirm?.label}</Text>
              <Text style={styles.copy}>
                Confirm to save this request and send it to Salesforce for approval.
                Your final invoice is generated only after approval. Stock is unchanged.
              </Text>
              {busy && <Text accessibilityRole="alert" style={styles.notice}>Finishing the current sync. Your selection is kept; confirmation will be available shortly.</Text>}
              <Button title={busy ? "Waiting for current sync…" : "Confirm and save"} disabled={busy || loggingOut} onPress={() => void enqueue()} />
              <Button title="Back to edit order" secondary disabled={busy || loggingOut} onPress={() => setConfirm(null)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  reviewOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center", padding: 20 },
  reviewDialog: { width: "100%", maxWidth: 720, maxHeight: "90%", backgroundColor: colors.white, borderRadius: 20 },
  safe: { flex: 1, backgroundColor: "#F4F9F5" },
  page: {
    padding: 14,
    width: "100%",
    paddingBottom: 24,
  },
  header: {
    padding: 20,
    backgroundColor: colors.navy,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 8,
    marginBottom: 16,
  },
  loginHero: { paddingTop: 26, paddingBottom: 42, borderRadius: 24 },
  loginCard: { marginTop: -32, marginHorizontal: 8 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#16734B",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  logoText: { color: colors.white, fontSize: 18, fontWeight: "900" },
  heroFooter: {
    borderTopWidth: 1,
    borderColor: "#34635E",
    marginTop: 16,
    paddingTop: 12,
    gap: 10,
  },
  date: {
    alignSelf: "flex-start",
    backgroundColor: colors.gold,
    color: colors.navy,
    padding: 7,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: "700",
  },
  security: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 20,
  },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 8 },
  smallCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 8,
  },
  syncBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E7F4EB",
    borderRadius: 12,
    paddingLeft: 12,
    marginBottom: 14,
    gap: 6,
  },
  syncText: {
    flex: 1,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    paddingVertical: 10,
  },
  refresh: { padding: 12, minHeight: 44, justifyContent: "center" },
  refreshText: { color: colors.brand, fontSize: 12, fontWeight: "800" },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
    marginVertical: 12,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  amount: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 12,
  },
  financeRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: 16,
    gap: 12,
  },
  financeColumn: { flex: 1 },
  financeValue: { color: colors.brand, fontSize: 17, fontWeight: "800" },
  eyebrow: {
    color: "#9DD9C9",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: "white",
    fontSize: 28,
    fontWeight: "900",
    marginVertical: 10,
  },
  white: { color: "#D8EEE8", fontSize: 13, lineHeight: 20 },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 14,
    marginVertical: 10,
    shadowColor: colors.navy,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  heading: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.ink,
    marginBottom: 10,
    marginTop: 10,
  },
  label: {
    marginTop: 14,
    marginBottom: 7,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.ink,
    fontSize: 16,
    minHeight: 52,
    backgroundColor: "white",
  },
  button: {
    padding: 15,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.brand,
    marginTop: 12,
    alignItems: "center",
  },
  secondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  buttonText: {
    color: "white",
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
  },
  notice: {
    padding: 14,
    backgroundColor: "#E7F4EB",
    color: "#173D2D",
    marginBottom: 12,
    lineHeight: 22,
    borderRadius: 12,
  },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 10 },
  tab: {
    padding: 12,
    minHeight: 44,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: { backgroundColor: colors.brand, borderColor: colors.brand },
  metric: { fontSize: 17, color: "#23483d", marginVertical: 10 },
});
