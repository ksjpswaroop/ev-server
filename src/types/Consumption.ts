import { ConnectorCurrentLimitSource, SiteAreaLimitSource } from './ChargingStation';

export default interface Consumption {
  id: string;
  startedAt: Date;
  endedAt: Date;
  transactionId: number;
  chargeBoxID: string;
  connectorId: number;
  siteAreaID: string;
  siteID: string;
  consumption: number;
  cumulatedAmount: number;
  cumulatedConsumption: number;
  cumulatedConsumptionAmps: number;
  pricingSource: string;
  amount: number;
  roundedAmount: number;
  currencyCode: string;
  instantPower: number;
  instantAmps: number;
  totalInactivitySecs: number;
  totalDurationSecs: number;
  stateOfCharge: number;
  userID: string;
  toPrice?: boolean;
  limitAmps?: number;
  limitWatts?: number;
  limitSource?: ConnectorCurrentLimitSource;
  limitSiteAreaAmps?: number;
  limitSiteAreaWatts?: number;
  limitSiteAreaSource?: SiteAreaLimitSource;
}
