type Allocation = {
  Beat__c: string;
  Beat__r: { Name: string };
  Outlet__c: string;
  Outlet__r: { Name: string };
};

/** One route per allocated beat, counting an outlet only once. */
export function allocatedBeats(rows: Allocation[], completedOutletIds: Set<string>) {
  const grouped = new Map<string, { name: string; outlets: Map<string, string> }>();
  for (const row of rows) {
    if (!grouped.has(row.Beat__c)) grouped.set(row.Beat__c, { name: row.Beat__r.Name, outlets: new Map() });
    grouped.get(row.Beat__c)!.outlets.set(row.Outlet__c, row.Outlet__r.Name);
  }
  return [...grouped].map(([id, beat]) => {
    const stores = beat.outlets.size;
    const completed = [...beat.outlets.keys()].filter((outletId) => completedOutletIds.has(outletId)).length;
    return { id, name: beat.name, stores, storeCount: stores, completed, pending: stores - completed,
      outletNames: [...beat.outlets.values()].sort().join(", ") };
  }).sort((left, right) => left.name.localeCompare(right.name));
}
