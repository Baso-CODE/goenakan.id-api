import { inject, injectable } from "tsyringe";
import { AnalyticsFilterQuery } from "./analytics.helper";
import { CustomerAnalyticsService } from "./customer-analytics.service";
import { OpsAnalyticsService } from "./ops-analytics.service";
import { SalesOverviewService } from "./sales-overview.service";
export type { AnalyticsFilterQuery } from "./analytics.helper";
@injectable()
export class AnalyticsService {
  constructor(
    @inject(SalesOverviewService)
    private readonly salesOverviewService: SalesOverviewService,
    @inject(CustomerAnalyticsService)
    private readonly customerAnalyticsService: CustomerAnalyticsService,
    @inject(OpsAnalyticsService)
    private readonly opsAnalyticsService: OpsAnalyticsService,
  ) {}

  getSalesOverviewData(query: AnalyticsFilterQuery) {
    return this.salesOverviewService.getSalesOverview(query);
  }

  getCustomerAnalyticsData(query: AnalyticsFilterQuery) {
    return this.customerAnalyticsService.getCustomerAnalytics(query);
  }

  getOpsAnalyticsData(query: AnalyticsFilterQuery) {
    return this.opsAnalyticsService.getOpsAnalytics(query);
  }
}
