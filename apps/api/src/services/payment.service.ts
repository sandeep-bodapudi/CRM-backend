import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { PrismaClient, Payment } from '@prisma/client';
import { TokenPayload } from '../utils/jwt';
import { PaymentPolicy } from '../policies/payment.policy';
import { BookingPolicy } from '../policies/booking.policy';
import { NotificationService } from './notification.service';
import { PAYMENT_EVENT_TYPE, INSTALLMENT_EVENT_TYPE } from '../shared';

const p = prisma;

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class PaymentService {
  private static async generateNextPaymentCode(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const count = await p.payment.count();
    const sequentialNum = (count + 1).toString().padStart(5, '0');
    return `RRH-PAY-${currentYear}-${sequentialNum}`;
  }

  static async getPayments(user: TokenPayload, bookingId?: number) {
    const whereCondition: any = { company_id: user.companyId };

    if (bookingId) {
      whereCondition.booking_id = bookingId;
    }

    // Similar scope restrictions could be applied here if an agent queries all payments
    const isManagement = (user.roles || []).some((r: any) =>
      [
        'Managing director',
        'Admin (Technical)',
        'HR',
        'accountant',
        'marketing director',
        'Digital lead operator',
        'project managers',
      ].includes(r),
    );

    if (!isManagement) {
      whereCondition.recorded_by_id = user.employeeId;
    }

    return await p.payment.findMany({
      where: whereCondition,
      include: {
        booking: {
          select: {
            booking_code: true,
            customer: { select: { first_name: true, last_name: true } },
          },
        },
        recorded_by: { select: { id: true, full_name: true } },
      },
      orderBy: { payment_date: 'desc' },
    });
  }

  static async recordPayment(user: TokenPayload, dto: any) {
    // Validate booking exists and is accessible
    const booking = await p.booking.findFirst({
      where: { id: dto.booking_id, company_id: user.companyId },
    });

    if (!booking) {
      throw new AppError(404, 'Booking not found');
    }

    if (!BookingPolicy.canView(user, booking)) {
      throw new AppError(403, 'You do not have access to record a payment for this booking');
    }

    if (dto.installment_id) {
      const installment = await p.installment.findFirst({
        where: { id: dto.installment_id, booking_id: booking.id },
      });
      if (!installment) {
        throw new AppError(404, 'Installment not found or does not belong to this booking');
      }
      if (dto.amount > installment.expected_amount - installment.received_amount) {
        throw new AppError(400, 'Collection amount exceeds remaining installment balance');
      }
      if (dto.amount <= 0) {
        throw new AppError(400, 'Collection amount must be greater than zero');
      }
    }

    if (booking.status === 'CANCELLED') {
      throw new AppError(400, 'Cannot record payment for a cancelled booking');
    }

    const paymentCode = await this.generateNextPaymentCode();

    return await p.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      const payment = await tx.payment.create({
        data: {
          payment_code: paymentCode,
          company_id: user.companyId || 1,
          booking_id: booking.id,
          amount: dto.amount,
          payment_method: dto.payment_method,
          reference_number: dto.reference_number,
          notes: dto.notes,
          status: 'PENDING', // All new payments require Finance verification
          recorded_by_id: user.employeeId || 1,
          installment_id: dto.installment_id || null,
        },
      });

      // Update booking balance assuming payment will be verified?
      // Strictly, we only reduce balance when status is SUCCESS.
      // For now, we just create the payment record.

      return payment;
    });
  }

  static async verifyPayment(user: TokenPayload, id: number, status: string) {
    const payment = await p.payment.findFirst({
      where: { id, company_id: user.companyId },
      include: { booking: true },
    });

    if (!payment) {
      throw new AppError(404, 'Payment not found');
    }

    if (!PaymentPolicy.canMutate(user, payment)) {
      throw new AppError(403, 'Permission denied');
    }

    // Packet 4: Admin MUST NOT gain financial approval authority merely because PaymentPolicy currently considers ADMIN a management role.
    if (
      (user.roles || []).includes('Admin (Technical)') &&
      !(user.roles || []).some((r: string) =>
        ['Managing director', 'FINANCE', 'accountant'].includes(r),
      )
    ) {
      throw new AppError(403, 'Admin role does not have financial verification authority');
    }

    // Allowed status changes. Before: a SUCCESSFUL payment could never be
    // refunded (blocked by an "already successful" check), while a payment
    // still PENDING could be marked REFUNDED -- which pushed a "refunded"
    // event to the customer portal for money that never arrived.
    const allowed: Record<string, string[]> = {
      PENDING: ['SUCCESS', 'FAILED'],
      FAILED: ['SUCCESS'], // e.g. a cheque that cleared late
      SUCCESS: ['REFUNDED'],
      REFUNDED: [],
    };
    if (!(allowed[payment.status] || []).includes(status)) {
      throw new AppError(
        400,
        payment.status === status
          ? `Payment is already ${status.toLowerCase()}`
          : `A ${payment.status.toLowerCase()} payment cannot be marked ${status.toLowerCase()}`,
      );
    }
    const isRefundOfCollected = payment.status === 'SUCCESS' && status === 'REFUNDED';

    const result = await p.$transaction(
      async (tx: import('@prisma/client').Prisma.TransactionClient) => {
        const updatedPayment = await tx.payment.update({
          where: { id },
          data: { status },
        });

        // Refunding money that was collected: undo exactly what the SUCCESS
        // step added (installment received amount, or the booking balance).
        if (isRefundOfCollected) {
          if (payment.installment_id) {
            const installment = await tx.installment.findUniqueOrThrow({
              where: { id: payment.installment_id },
            });
            const newReceived = Math.max(0, installment.received_amount - payment.amount);
            await tx.installment.update({
              where: { id: installment.id },
              data: {
                received_amount: newReceived,
                status: newReceived <= 0 ? 'PENDING' : 'PARTIALLY_RECEIVED',
                received_date: null,
              },
            });
          } else {
            await tx.booking.update({
              where: { id: payment.booking.id },
              data: { balance_amount: payment.booking.balance_amount + payment.amount },
            });
          }
          await tx.auditEvent.create({
            data: {
              actor_id: user.employeeId || 1,
              action: 'PAYMENT_REFUNDED',
              entity_type: 'Payment',
              entity_id: payment.id,
              old_value: 'SUCCESS',
              new_value: JSON.stringify({ status: 'REFUNDED', amount: payment.amount }),
            },
          });
        }

        if (status === 'SUCCESS') {
          if (payment.installment_id) {
            // Packet 4 logic: Do NOT modify Booking.balance_amount. Update Installment atomically.
            const installment = await tx.installment.findUniqueOrThrow({
              where: { id: payment.installment_id },
            });

            if (payment.amount > installment.expected_amount - installment.received_amount) {
              throw new AppError(
                400,
                'Verification failed: Payment amount exceeds remaining installment balance',
              );
            }

            const newReceivedAmount = installment.received_amount + payment.amount;
            const newStatus =
              newReceivedAmount >= installment.expected_amount ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

            const updateResult = await tx.installment.updateMany({
              where: { id: installment.id, received_amount: installment.received_amount },
              data: {
                received_amount: newReceivedAmount,
                status: newStatus,
                received_date: newStatus === 'RECEIVED' ? new Date() : undefined,
              },
            });

            if (updateResult.count === 0) {
              throw new AppError(
                409,
                'Concurrency conflict: Installment was modified by another request',
              );
            }

            // Create audit event
            await tx.auditEvent.create({
              data: {
                actor_id: user.employeeId || 1,
                action: 'INSTALLMENT_COLLECTED',
                entity_type: 'Installment',
                entity_id: installment.id,
                old_value: JSON.stringify({
                  received_amount: installment.received_amount,
                  status: installment.status,
                }),
                new_value: JSON.stringify({
                  received_amount: newReceivedAmount,
                  status: newStatus,
                }),
              },
            });

            // Phase 11 Packet 3H — Installment / Financial Status Sync.
            // Emit INSTALLMENT_STATUS_CHANGED only when the installment's persisted
            // financial state genuinely changed (PENDING → PARTIALLY_RECEIVED /
            // RECEIVED, PARTIALLY_RECEIVED → RECEIVED). OVERDUE is read-derived in
            // the CRM and never persisted, so it is never emitted. OVERDUE is not
            // persisted and a FAILED/REFUNDED verify never touches the installment,
            // so the sole trigger here is a successful collection on an
            // installment-linked payment. Atomic with the payment + installment
            // update — one genuine state change yields exactly one event.
            if (newStatus !== installment.status) {
              await tx.integrationEvent.create({
                data: {
                  event_type: INSTALLMENT_EVENT_TYPE,
                  payload: JSON.stringify({
                    event_type: INSTALLMENT_EVENT_TYPE,
                    company_id: user.companyId || 1,
                    crms_customer_id: payment.booking.customer_id,
                    crms_booking_id: payment.booking.id,
                    installment_id: installment.id,
                    installment_number: installment.installment_number,
                    status: newStatus,
                    expected_amount: installment.expected_amount,
                    received_amount: newReceivedAmount,
                    remaining_amount: Math.max(0, installment.expected_amount - newReceivedAmount),
                    changed_at: new Date().toISOString(),
                  }),
                  status: 'CREATED',
                  company_id: user.companyId || 1,
                  crms_booking_id: payment.booking.id,
                  crms_customer_id: payment.booking.customer_id,
                },
              });
            }
          } else {
            // Legacy logic: Reduce the booking balance
            const newBalance = Math.max(0, payment.booking.balance_amount - payment.amount);

            await tx.booking.update({
              where: { id: payment.booking.id },
              data: { balance_amount: newBalance },
            });
          }
        }

        // Phase 11 Packet 3F — Payment Synchronization. Emit a PAYMENT_STATUS_CHANGED
        // outbox event (delivered by PortalWorker to the Portal) whenever a payment
        // reaches a Portal-relevant terminal state. Atomic with the payment/installment
        // update above: a genuine transition yields exactly one event. A duplicate
        // verifyPayment call is blocked earlier (already-SUCCESS guard) so no second
        // event can be emitted for the same payment.
        if (status === 'SUCCESS' || status === 'REFUNDED') {
          await tx.payment.update({
            where: { id },
            data: { sync_status: 'PENDING_SYNC' },
          });

          await tx.integrationEvent.create({
            data: {
              event_type: PAYMENT_EVENT_TYPE,
              payload: JSON.stringify({
                event_type: PAYMENT_EVENT_TYPE,
                company_id: user.companyId,
                crms_customer_id: payment.booking.customer_id,
                crms_booking_id: payment.booking.id,
                payment_id: payment.id,
                payment_code: payment.payment_code,
                installment_id: payment.installment_id ?? null,
                amount: payment.amount,
                status,
                payment_date: payment.payment_date.toISOString(),
                reference_number: payment.reference_number ?? null,
              }),
              status: 'CREATED',
              company_id: user.companyId || 1,
              crms_booking_id: payment.booking.id,
              crms_customer_id: payment.booking.customer_id,
            },
          });

          await tx.auditEvent.create({
            data: {
              actor_id: user.employeeId || 1,
              action: 'PAYMENT_SYNC_INITIATED',
              entity_type: 'Payment',
              entity_id: payment.id,
              old_value: 'LOCAL',
              new_value: 'PENDING_SYNC',
            },
          });

          // Packet 3E CustomerNotification for a genuine confirmed-payment transition.
          // Same transaction; content is LOW sensitivity only.
          if (status === 'SUCCESS') {
            await NotificationService.createCustomerNotificationTx(tx, {
              company_id: user.companyId || 1,
              customer_id: payment.booking.customer_id,
              booking_id: payment.booking.id,
              type: 'PAYMENT_STATUS_UPDATED',
              title: 'Payment Confirmed',
              message: `Your payment of ${payment.amount} for booking ${payment.booking.booking_code} is confirmed.`,
            });
          }
        }

        return updatedPayment;
      },
    );

    if (status === 'SUCCESS') {
      // §7: receipt generation has moved to the customer portal (the document
      // module was removed from CRM). No-op here — the portal owns agreement/receipt docs.
      logger.info('Payment ' + id + ' succeeded; receipt generation is portal-owned (§7).');
    }

    return result;
  }
}
