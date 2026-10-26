/** Aggregate independently of capped detail lists; never infer delivery from approval. */
export async function distributorDashboard(
  id: string,
  records: (query: string) => Promise<any[]>,
  now = new Date(),
) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      label: date.toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      purchased: 0,
      sold: 0,
    };
  });
  const from = `${months[0].year}-${String(months[0].month).padStart(2, "0")}-01`;
  const summaries: Record<string, number> = {};
  for (const [key, object, field, status, dateField] of [
    ["purchased", "DMS_Goods_Receipt__c", "Total_Value__c", "Received", "Received_Date__c"],
    ["sold", "DMS_Invoice__c", "Total_Amount__c", "Issued", "Invoice_Date__c"],
  ]) {
    const filter = `FROM ${object} WHERE Distributor__c='${id}' AND Status__c='${status}'${key === "sold" ? " AND Sales_Order__c != null" : ""}`;
    const total = await records(`SELECT SUM(${field}) amount ${filter}`);
    summaries[key] = Number(total[0]?.amount || 0);
    const groups = await records(
      `SELECT CALENDAR_YEAR(${dateField}) year,CALENDAR_MONTH(${dateField}) month,SUM(${field}) amount ${filter} AND ${dateField}>=${from} AND ${dateField}<=TODAY GROUP BY CALENDAR_YEAR(${dateField}),CALENDAR_MONTH(${dateField})`,
    );
    for (const group of groups) {
      const month = months.find(
        (row) => row.year === Number(group.year) && row.month === Number(group.month),
      );
      if (month) month[key as "purchased" | "sold"] = Number(group.amount || 0);
    }
  }
  return {
    purchased: summaries.purchased,
    sold: summaries.sold,
    months,
    basis:
      "Received purchase cost versus issued sales invoice value; not net of returns and not a profit calculation.",
  };
}
