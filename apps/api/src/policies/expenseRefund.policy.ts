import { TokenPayload } from '../utils/jwt';
import { Permissions, ExpenseRefundStatus } from '../shared';
import { ExpenseRefund } from '@prisma/client';

export class ExpenseRefundPolicy {
  static canCreate(user: TokenPayload): boolean {
    return (user.permissions || []).includes(Permissions.EXPENSES_CREATE);
  }

  static canListOwn(user: TokenPayload): any {
    return { employee_id: user.employeeId };
  }

  static canListQueue(user: TokenPayload): any {
    const hasReview = (user.permissions || []).includes(Permissions.EXPENSES_REVIEW);
    const hasMDApprove = (user.permissions || []).includes(Permissions.EXPENSES_MD_APPROVE);

    let statusFilter: any;
    if (hasMDApprove && hasReview) {
      statusFilter = {
        status: {
          in: [
            ExpenseRefundStatus.PENDING,
            ExpenseRefundStatus.ACCOUNTANT_APPROVED,
            ExpenseRefundStatus.MD_APPROVED,
          ],
        },
      };
    } else if (hasMDApprove) {
      statusFilter = { status: ExpenseRefundStatus.ACCOUNTANT_APPROVED };
    } else if (hasReview) {
      statusFilter = {
        status: { in: [ExpenseRefundStatus.PENDING, ExpenseRefundStatus.MD_APPROVED] },
      };
    } else {
      statusFilter = { status: 'INVALID_NO_PERMISSION' };
    }

    return {
      AND: [{ company_id: user.companyId }, statusFilter],
    };
  }

  static canAccountantReview(user: TokenPayload, refund: ExpenseRefund): boolean {
    if (!(user.permissions || []).includes(Permissions.EXPENSES_REVIEW)) return false;
    if (refund.company_id !== user.companyId) return false;
    if (refund.employee_id === user.employeeId) return false;
    return refund.status === ExpenseRefundStatus.PENDING;
  }

  static canMdReview(user: TokenPayload, refund: ExpenseRefund): boolean {
    if (!(user.permissions || []).includes(Permissions.EXPENSES_MD_APPROVE)) return false;
    if (refund.company_id !== user.companyId) return false;
    if (refund.employee_id === user.employeeId) return false;
    return refund.status === ExpenseRefundStatus.ACCOUNTANT_APPROVED;
  }

  static canMarkRefunded(user: TokenPayload, refund: ExpenseRefund): boolean {
    if (!(user.permissions || []).includes(Permissions.EXPENSES_MARK_REFUNDED)) return false;
    if (refund.company_id !== user.companyId) return false;
    if (refund.employee_id === user.employeeId) return false;
    return refund.status === ExpenseRefundStatus.MD_APPROVED;
  }

  static canViewProof(user: TokenPayload, refund: ExpenseRefund): boolean {
    if (refund.company_id !== user.companyId) return false;
    if (refund.employee_id === user.employeeId) return true;
    const hasReview = (user.permissions || []).includes(Permissions.EXPENSES_REVIEW);
    const hasMDApprove = (user.permissions || []).includes(Permissions.EXPENSES_MD_APPROVE);
    const hasMarkRefunded = (user.permissions || []).includes(Permissions.EXPENSES_MARK_REFUNDED);
    return hasReview || hasMDApprove || hasMarkRefunded;
  }
}
