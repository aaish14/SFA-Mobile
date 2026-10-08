import type { Store } from "../types";
export const orgOutlets: Store[] = [
 ["a05jV000002aKP3QAM","EC City Bazaar","9210000088","MG Road 3rd cross"],
 ["a05jV000002aKP5QAM","EC Corner Shop","9210000090","Central Market Beat"],
 ["a05jV000002aKP4QAM","EC Daily Needs","9210000089","Electronic City Beat"],
 ["a05jV000002aKOwQAM","EC Family Mart","9210000081","Electronic City Beat"],
 ["a05jV000002aKP1QAM","EC Fresh Mart","9210000086","Electronic City Beat"],
 ["a05jV000002aKOyQAM","EC Green Grocers","9210000083","Electronic City Beat"],
 ["a05jV000002aKP0QAM","EC Provision House","9210000085","Electronic City Beat"],
 ["a05jV000002aKOxQAM","EC Super Store","9210000082","Electronic City Beat"],
 ["a05jV000002aKP2QAM","EC Traders","9210000087","Electronic City Beat"],
 ["a05jV000002aKOzQAM","EC Value Store","9210000084","Electronic City Beat"],
].map(([id,name,phone,beat],i)=>({id,beatId:"snapshot",name,code:`EC-OUT-${String(i+1).padStart(3,"0")}`,address:"Electronic City, Bengaluru",contact:phone,status:"Active",lastVisit:"None",lastOrder:0,latitude:12.84,longitude:77.67,beatName:beat,owner:"Retail Partner",distance:18.4+i/10} as Store));
