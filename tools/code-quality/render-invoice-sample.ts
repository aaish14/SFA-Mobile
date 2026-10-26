import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInvoicePdf } from "../../sales-rep-mobile/backend/src/services/invoicePdf";
async function main() {
  const lines = Array.from({length:24},(_,i)=>({
    Product_Name__c: i === 0 ? "DEMO - Yippee Magic Masala" : `DEMO product ${i+1} with a long descriptive name to verify line wrapping and page breaks`,
    Cases__c: 2, Case_Price__c: 100, Quantity_Pieces__c:40,
    Gross_Amount__c:200,Discount_Amount__c:10,Tax_Amount__c:9.5,Total_Amount__c:199.5,
    Scheme_Name__c: "DEMO scheme", Bonus_Details__c:"One free case of demo promotional product"
  }));
  const pdf=await createInvoicePdf({Name:"DEMO-NOT-A-REAL-INVOICE",Status__c:"Issued",Invoice_Date__c:"2026-10-26",Primary_Order__c:"demo",Primary_Order__r:{Name:"DEMO-ORDER"},Bill_To_Name__c:"Demo distributor",Supplier_Name__c:"Demo company",Gross_Amount__c:4800,Discount_Amount__c:240,Tax_Amount__c:228,Total_Amount__c:4788,Paid_Amount__c:0,Balance_Due__c:4788,lines});
  const folder=resolve("tmp/pdfs/invoice");mkdirSync(folder,{recursive:true});writeFileSync(resolve(folder,"demo-invoice.pdf"),pdf);
  console.log("Rendered synthetic invoice for visual checking; no Salesforce records written.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
