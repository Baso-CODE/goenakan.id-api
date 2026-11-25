import { InvoiceStatus, OrderStatus, Prisma, SalesCategory } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { PrismaService } from "../../prisma/prisma.service";
import { AnalyticsFilterQuery, calculateDateRange, round } from "./analytics.helper";

type Seller = { id: string; name: string };
type OrderRow = {
  id: string; salesUserId: string | null; clientId: string;
  dateOrder: Date; currencyCode: string; totalAmount: Prisma.Decimal;
  salesCategory: SalesCategory; purchaseChannel: { name: string } | null;
};
type QuoteRow = {
  id: string; salesUserId: string | null; createdAt: Date; status: string;
  clientId: string | null; firstSentAt: Date | null; firstAcceptedAt: Date | null;
  resultingOrders: { salesCategory: SalesCategory; createdAt: Date; clientId: string }[];
};
type InvoiceRow = { status: InvoiceStatus; totalAmount: Prisma.Decimal; order: { salesUserId: string | null; currencyCode: string } | null };
const DAY = 86400000;
const monthKey = (date: Date) => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 7);
const moneySum = (values: Prisma.Decimal[]) => values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0)).toNumber();
const average = (values: number[]) => values.length ? round(values.reduce((a,b) => a+b,0)/values.length,1) : null;
const rate = (num: number, den: number) => den ? round(num/den*100,1) : null;
const days = (a: Date | null, b: Date | null) => {
  if (!a || !b) return null;
  const value = (b.getTime()-a.getTime())/DAY;
  return Number.isFinite(value) && value >= 0 ? value : null;
};
function validDate(value: number | null): value is number { return value !== null; }

function summarize(orders: OrderRow[], quotes: QuoteRow[], invoices: InvoiceRow[], currency: string, firstIds: Set<string>, now: Date) {
  const sales = orders.filter(o => o.salesCategory === SalesCategory.SALES);
  const selected = sales.filter(o => o.currencyCode === currency);
  const totalSales = moneySum(selected.map(o => o.totalAmount));
  const customers = new Set(sales.map(o => o.clientId));
  const newCustomers = new Set(sales.filter(o => firstIds.has(o.id)).map(o => o.clientId));
  const linked = (q: QuoteRow, category: SalesCategory) => q.resultingOrders.filter(o => o.salesCategory === category && q.clientId !== null && o.clientId === q.clientId && o.createdAt >= q.createdAt && o.createdAt <= now);
  const accepted = quotes.filter(q => q.status === "ACCEPTED").length;
  const convertedToSample = quotes.filter(q => linked(q, SalesCategory.SAMPLE).length > 0).length;
  const convertedToSales = quotes.filter(q => linked(q, SalesCategory.SALES).length > 0).length;
  const sendingTimes = quotes.map(q => q.firstSentAt && q.firstSentAt <= now ? days(q.createdAt,q.firstSentAt) : null).filter(validDate);
  const closingTimes = quotes.map(q => {
    const acceptedAt = q.firstAcceptedAt;
    if (!acceptedAt || acceptedAt < q.createdAt || acceptedAt > now) return null;
    const first = linked(q, SalesCategory.SALES).find(o => o.createdAt >= acceptedAt);
    return days(acceptedAt, first?.createdAt ?? null);
  }).filter(validDate);
  const currencyInvoices = invoices.filter(i => i.order?.currencyCode === currency);
  return {
    totalSales, salesOrders: sales.length, sampleOrders: orders.length-sales.length,
    averageOrderValue: selected.length ? round(totalSales/selected.length,2) : null,
    grossPaidInvoices: moneySum(currencyInvoices.filter(i => i.status === InvoiceStatus.PAID).map(i => i.totalAmount)),
    outstandingInvoices: moneySum(currencyInvoices.filter(i => i.status === InvoiceStatus.UNPAID || i.status === InvoiceStatus.OVERDUE).map(i => i.totalAmount)),
    totalCustomers: customers.size, newCustomers: newCustomers.size, returningCustomers: customers.size-newCustomers.size,
    totalQuotation: quotes.length, draft: quotes.filter(q=>q.status === "DRAFT").length,
    sent: quotes.filter(q=>q.status === "SENT").length, accepted,
    rejected: quotes.filter(q=>q.status === "REJECTED").length,
    acceptanceRate: rate(accepted, quotes.length), convertedToSample, convertedToSales,
    sampleConversionRate: rate(convertedToSample,quotes.length), salesConversionRate: rate(convertedToSales,quotes.length),
    avgSendingLeadTime: average(sendingTimes), avgClosingLeadTime: average(closingTimes),
    sendingLeadTimeCount: sendingTimes.length, closingLeadTimeCount: closingTimes.length,
  };
}

@injectable()
export class SalesPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertRole(actorId: string, role: "SUPER_ADMIN" | "ADMIN_SALES") {
    const actor = await this.prisma.user.findUnique({where:{id:actorId}, select:{id:true,name:true,email:true,role:{select:{name:true}}}});
    if (!actor) throw new ApiError("Unauthorized",401);
    if (actor.role.name !== role) throw new ApiError("Forbidden",403);
    return actor;
  }

  async getPerformance(query: AnalyticsFilterQuery, actorId: string, personal: boolean, selectedId?: string, requestedCurrency?: string) {
    const actor = await this.assertRole(actorId, personal ? "ADMIN_SALES" : "SUPER_ADMIN");
    if (personal && selectedId !== undefined) throw new ApiError("Personal analytics cannot select another sales user",403);
    if (requestedCurrency !== undefined && !/^[A-Z]{3}$/.test(requestedCurrency)) throw new ApiError("Invalid currency",400);
    const range = calculateDateRange(query);
    const {start,end} = range;
    const generatedAt = new Date();
    const sellers: Seller[] = personal ? [{id:actor.id,name:actor.name || actor.email}] : (await this.prisma.user.findMany({where:{role:{name:"ADMIN_SALES"}},select:{id:true,name:true,email:true},orderBy:{name:"asc"}})).map(u=>({id:u.id,name:u.name || u.email}));
    const ids = sellers.map(s=>s.id);
    if (selectedId && !ids.includes(selectedId)) throw new ApiError("Sales user not found",404);
    const selectedSellers = selectedId ? sellers.filter(s=>s.id === selectedId) : sellers;
    const scopeIds = selectedSellers.map(s=>s.id);
    const ownerWhere = { salesUserId: { in: scopeIds } };
    const orderWhere: Prisma.OrderWhereInput = {...ownerWhere,status:{not:OrderStatus.CANCELLED}, dateOrder:{gte:start,lte:end}};
    const quoteWhere: Prisma.QuotationWhereInput = {...ownerWhere, createdAt:{gte:start,lte:end}};
    const [orders, quotes, invoices] = await Promise.all([
      this.prisma.order.findMany({where:orderWhere,select:{id:true,salesUserId:true,clientId:true,dateOrder:true,currencyCode:true,totalAmount:true,salesCategory:true,purchaseChannel:{select:{name:true}}}}),
      this.prisma.quotation.findMany({where:quoteWhere,select:{id:true,salesUserId:true,createdAt:true,status:true,clientId:true,firstSentAt:true,firstAcceptedAt:true,resultingOrders:{where:{status:{not:OrderStatus.CANCELLED},createdAt:{lte:generatedAt}},select:{salesCategory:true,createdAt:true,clientId:true},orderBy:[{createdAt:"asc"},{id:"asc"}]}}}),
      this.prisma.invoice.findMany({where:{order:{is:{...ownerWhere,salesCategory:SalesCategory.SALES,status:{not:OrderStatus.CANCELLED}}},OR:[{status:InvoiceStatus.PAID,OR:[{paidAt:{gte:start,lte:end}},{paidAt:null,paymentDate:{gte:start,lte:end}}]},{status:{in:[InvoiceStatus.UNPAID,InvoiceStatus.OVERDUE]},createdAt:{gte:start,lte:end}}]},select:{status:true,totalAmount:true,order:{select:{salesUserId:true,currencyCode:true}}}}),
    ]);
    // First-ever SALES order, not SAMPLE; deterministic tie-break by id.
    // Other owners' records are only used internally to classify customer history.
    const clientIds = [...new Set(orders.filter(o=>o.salesCategory===SalesCategory.SALES).map(o=>o.clientId))];
    const firstOrders = clientIds.length ? await this.prisma.order.findMany({where:{clientId:{in:clientIds},salesCategory:SalesCategory.SALES,status:{not:OrderStatus.CANCELLED}},select:{id:true,clientId:true},orderBy:[{dateOrder:"asc"},{id:"asc"}],distinct:["clientId"]}) : [];
    const firstIds = new Set(firstOrders.map(o=>o.id));
    const currencies = [...new Set([
      ...orders.filter(o=>o.salesCategory===SalesCategory.SALES).map(o=>o.currencyCode),
      ...invoices.flatMap(i=>i.order ? [i.order.currencyCode] : []),
      ...(requestedCurrency ? [requestedCurrency] : []),
    ])].sort();
    const currency = requestedCurrency ?? (currencies.includes("IDR") ? "IDR" : currencies[0] || "IDR");
    if (!currencies.includes(currency)) currencies.push(currency);
    const metrics = summarize(orders,quotes,invoices,currency,firstIds,generatedAt);
    const byOwner = <T extends {salesUserId: string | null}>(rows:T[]) => {
      const map = new Map<string,T[]>();
      for (const row of rows) if (row.salesUserId) { const list=map.get(row.salesUserId) ?? []; list.push(row); map.set(row.salesUserId,list); }
      return map;
    };
    const ownerOrders=byOwner(orders), ownerQuotes=byOwner(quotes);
    const invoiceGroups=new Map<string,InvoiceRow[]>();
    for(const invoice of invoices) if(invoice.order?.salesUserId){const key=invoice.order.salesUserId; const list=invoiceGroups.get(key)??[];list.push(invoice);invoiceGroups.set(key,list);}
    const leaderboard = personal ? [] : selectedSellers.map(s=>({id:s.id,name:s.name,...summarize(ownerOrders.get(s.id)??[],ownerQuotes.get(s.id)??[],invoiceGroups.get(s.id)??[],currency,firstIds,generatedAt)}));
    const monthly = new Map<string,{month:string;label:string;amounts:Record<string,number>;salesOrders:number}>();
    const cursor = new Date(`${monthKey(start)}-01T00:00:00Z`);
    const lastMonth = monthKey(end);
    while (cursor.toISOString().slice(0,7) <= lastMonth) {
      const key=cursor.toISOString().slice(0,7);
      monthly.set(key,{month:key,label:cursor.toLocaleDateString("en-US",{month:"short",year:"numeric",timeZone:"UTC"}),amounts:Object.fromEntries(selectedSellers.map(s=>[`sales_${s.id}`,0])),salesOrders:0});
      cursor.setUTCMonth(cursor.getUTCMonth()+1);
    }
    const channelCounts = new Map<string,number>();
    for (const order of orders) {
      if (order.salesCategory !== SalesCategory.SALES) continue;
      const channel = order.purchaseChannel?.name?.trim() || "Unassigned";
      channelCounts.set(channel,(channelCounts.get(channel)??0)+1);
      const bucket = monthly.get(monthKey(order.dateOrder));
      if (!bucket) continue;
      bucket.salesOrders++;
      if (order.currencyCode===currency && order.salesUserId) bucket.amounts[`sales_${order.salesUserId}`] += order.totalAmount.toNumber();
    }
    for (const bucket of monthly.values()) for (const key of Object.keys(bucket.amounts)) bucket.amounts[key]=round(bucket.amounts[key],2);
    // Data quality is TEAM-ONLY. It must not reveal company totals to personal users.
    let dataQuality: {unassignedOrders:number;unassignedQuotations:number;otherOwnerOrders:number;otherOwnerQuotations:number}|null = null;
    let ownershipQueue: {type:"order"|"quotation";id:string;number:string;date:Date;createdBy:string|null}[] = [];
    if (!personal) {
      const otherOwner = ids.length ? {not:null,notIn:ids} : {not:null};
      const [unassignedOrders,unassignedQuotations,otherOwnerOrders,otherOwnerQuotations,unassignedOrderRows,unassignedQuoteRows] = await Promise.all([
        this.prisma.order.count({where:{...orderWhere,salesUserId:null}}),
        this.prisma.quotation.count({where:{...quoteWhere,salesUserId:null}}),
        this.prisma.order.count({where:{...orderWhere,salesUserId:otherOwner}}),
        this.prisma.quotation.count({where:{...quoteWhere,salesUserId:otherOwner}}),
        this.prisma.order.findMany({where:{...orderWhere,salesUserId:null},select:{id:true,orderNumber:true,dateOrder:true,createdBy:{select:{name:true,email:true}}},orderBy:[{dateOrder:"desc"},{id:"desc"}],take:15}),
        this.prisma.quotation.findMany({where:{...quoteWhere,salesUserId:null},select:{id:true,quotationNumber:true,createdAt:true,user:{select:{name:true,email:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],take:15}),
      ]);
      dataQuality={unassignedOrders,unassignedQuotations,otherOwnerOrders,otherOwnerQuotations};
      ownershipQueue = [
        ...unassignedOrderRows.map(o=>({type:"order" as const,id:o.id,number:o.orderNumber || o.id,date:o.dateOrder,createdBy:o.createdBy?.name || o.createdBy?.email || null})),
        ...unassignedQuoteRows.map(q=>({type:"quotation" as const,id:q.id,number:q.quotationNumber || q.id,date:q.createdAt,createdBy:q.user?.name || q.user?.email || null})),
      ].sort((a,b)=>b.date.getTime()-a.date.getTime());
    }
    return {scope:personal?"personal":"team", sellers:personal?[]:sellers, chartSellers:selectedSellers, currency, currencies, metrics, leaderboard, months:[...monthly.values()], channels:[...channelCounts].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),dataQuality,ownershipQueue,period:range,generatedAt};
  }

  private parseDocument(type: unknown, id: unknown) {
    if ((type!=="order" && type!=="quotation") || typeof id!=="string" || !id.trim() || id.length>100) throw new ApiError("Invalid document type or ID",400);
    return {type,id:id.trim()} as {type:"order"|"quotation";id:string};
  }

  async getOwnership(actorId:string, type:unknown, id:unknown) {
    await this.assertRole(actorId,"SUPER_ADMIN");
    const doc = this.parseDocument(type,id);
    const ownerSelect = {salesUserId:true,salesUser:{select:{id:true,name:true,email:true}}} as const;
    const record=doc.type==="order" ? await this.prisma.order.findUnique({where:{id:doc.id},select:ownerSelect}) : await this.prisma.quotation.findUnique({where:{id:doc.id},select:ownerSelect});
    if (!record) throw new ApiError("Document not found",404);
    const users=await this.prisma.user.findMany({where:{role:{name:"ADMIN_SALES"}},select:{id:true,name:true,email:true},orderBy:{name:"asc"}});
    return {salesUserId:record.salesUserId,currentOwner:record.salesUser?.name || record.salesUser?.email || null,users:users.map(u=>({id:u.id,name:u.name || u.email}))};
  }

  async changeOwnership(actorId:string, input: {documentType?:unknown;documentId?:unknown;salesUserId?:unknown;reason?:unknown;expectedSalesUserId?:unknown}) {
    await this.assertRole(actorId,"SUPER_ADMIN");
    const doc=this.parseDocument(input.documentType,input.documentId);
    const nextOwner=input.salesUserId;
    const expected=input.expectedSalesUserId;
    const reason=typeof input.reason==="string" ? input.reason.trim() : "";
    if ((nextOwner!==null && (typeof nextOwner!=="string" || !nextOwner.trim() || nextOwner.length>100)) || (expected!==null && (typeof expected!=="string" || !expected.trim() || expected.length>100))) throw new ApiError("Invalid sales owner",400);
    if (reason.length<10 || reason.length>500) throw new ApiError("Reason must be 10–500 characters",400);
    return this.prisma.$transaction(async tx=>{
      if (nextOwner!==null) {
        const seller=await tx.user.findUnique({where:{id:nextOwner},select:{role:{select:{name:true}}}});
        if (seller?.role.name!=="ADMIN_SALES") throw new ApiError("Sales owner must have ADMIN_SALES role",400);
      }
      const record=doc.type==="order" ? await tx.order.findUnique({where:{id:doc.id},select:{salesUserId:true}}) : await tx.quotation.findUnique({where:{id:doc.id},select:{salesUserId:true}});
      if (!record) throw new ApiError("Document not found",404);
      if (record.salesUserId!==expected) throw new ApiError("Sales owner has changed. Reload and try again.",409);
      if (record.salesUserId===nextOwner) throw new ApiError("Sales owner is unchanged",400);
      const where={id:doc.id,salesUserId:record.salesUserId};
      const data={salesUserId:nextOwner,updatedById:actorId};
      const updated=doc.type==="order" ? await tx.order.updateMany({where,data}) : await tx.quotation.updateMany({where,data});
      if (updated.count!==1) throw new ApiError("Concurrent ownership change. Reload and try again.",409);
      await tx.salesOwnershipAudit.create({data:{documentType:doc.type,documentId:doc.id,changedByUserId:actorId,previousSalesUserId:record.salesUserId,newSalesUserId:nextOwner,reason}});
      return {salesUserId:nextOwner};
    });
  }
}
