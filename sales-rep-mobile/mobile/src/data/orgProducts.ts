import type { Product } from "../types";

// Last successful Salesforce synchronization. The API replaces this snapshot when online.
export const orgProducts: Product[] = [
  ["a04jV000000WyndQAC","Aashirvaad Atta 5kg","SFA-P013",263.5,800],
  ["a04jV000000WynYQAS","Bingo Mad Angles","SFA-P008",17,675],
  ["a04jV000000WynSQAS","Britannia Good Day Cashew","SFA-P002",34,525],
  ["a04jV000000WyniQAC","Colgate Strong Teeth 200g","SFA-P018",97.75,925],
  ["a04jV000000WynjQAC","Dettol Handwash 200ml","SFA-P019",84.15,950],
  ["a04jV000000WynhQAC","Dove Bathing Bar","SFA-P017",55.25,900],
  ["a04jV000000WyneQAC","Fortune Sunflower Oil 1L","SFA-P014",123.25,825],
  ["a04jV000000WynZQAS","Haldiram Aloo Bhujia","SFA-P009",46.75,700],
  ["a04jV000000WynVQAS","Hide and Seek Chocolate","SFA-P005",42.5,600],
  ["a04jV000000WynWQAS","Kurkure Masala Munch","SFA-P006",17,625],
  ["a04jV000000WynXQAS","Lays Classic Salted","SFA-P007",17,650],
  ["a04jV000000WynaQAC","Maggi 2-Minute Noodles","SFA-P010",11.9,725],
  ["a04jV000000WynUQAS","Oreo Vanilla Creme","SFA-P004",29.75,575],
  ["a04jV000000VjbxQAC","Parle-G Demo Pack","PG-DEMO-001",9,500],
  ["a04jV000000WynRQAS","Parle-G Original 100g","SFA-P001",8.5,500],
  ["a04jV000000WynkQAC","Red Label Tea 500g","SFA-P020",229.5,975],
  ["a04jV000000WynTQAS","Sunfeast Marie Light","SFA-P003",25.5,550],
  ["a04jV000000XkNRQA0","Sunrise Millet Bites","SMB-100",22,480],
  ["a04jV000000WynfQAC","Surf Excel Easy Wash 1kg","SFA-P015",140.25,850],
  ["a04jV000000WyncQAC","Tata Salt 1kg","SFA-P012",23.8,775],
  ["a04jV000000WyngQAC","Vim Dishwash Bar","SFA-P016",8.5,875],
  ["a04jV000000WynbQAC","Yippee Magic Masala","SFA-P011",12.75,750],
].map(([id,name,code,price,stock]) => ({ id:String(id), name:String(name), code:String(code), price:Number(price), stock:Number(stock) }));
