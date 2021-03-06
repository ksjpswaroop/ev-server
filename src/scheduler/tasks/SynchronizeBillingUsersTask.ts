import BillingFactory from '../../integration/billing/BillingFactory';
import { LockEntity } from '../../types/Locking';
import LockingManager from '../../locking/LockingManager';
import Logging from '../../utils/Logging';
import NotificationHandler from '../../notification/NotificationHandler';
import SchedulerTask from '../SchedulerTask';
import { ServerAction } from '../../types/Server';
import { TaskConfig } from '../../types/TaskConfig';
import Tenant from '../../types/Tenant';
import Utils from '../../utils/Utils';

export default class SynchronizeBillingUsersTask extends SchedulerTask {
  async processTenant(tenant: Tenant, config: TaskConfig): Promise<void> {
    // Get the lock
    const billingLock = LockingManager.createExclusiveLock(tenant.id, LockEntity.USER, 'synchronize-billing');
    if (await LockingManager.acquire(billingLock)) {
      try {
        const billingImpl = await BillingFactory.getBillingImpl(tenant.id);
        if (billingImpl) {
          const synchronizeAction = await billingImpl.synchronizeUsers(tenant.id);
          if (synchronizeAction.inError > 0) {
            await NotificationHandler.sendBillingUserSynchronizationFailed(
              tenant.id,
              {
                nbrUsersInError: synchronizeAction.inError,
                evseDashboardURL: Utils.buildEvseURL(tenant.subdomain),
                evseDashboardBillingURL: await Utils.buildEvseBillingSettingsURL(tenant.id)
              }
            );
          }
        }
      } catch (error) {
        // Log error
        Logging.logActionExceptionMessage(tenant.id, ServerAction.BILLING_SYNCHRONIZE_USERS, error);
      } finally {
        // Release the lock
        await LockingManager.release(billingLock);
      }
    }
  }
}
