import express, { Router } from "express";
import { validate } from "../middleware/validate.middleware";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/rbac.middleware";
import { verifyCsrf } from "../middleware/csrf.middleware";

import { AuthRepository } from "../modules/auth/auth.repository";
import { AuthService } from "../modules/auth/auth.service";
import { AuthController } from "../modules/auth/auth.controller";
import { loginSchema, refreshSchema, registerSchema } from "../modules/auth/auth.schemas";

import { ClientsRepository } from "../modules/clients/clients.repository";
import { ClientsService } from "../modules/clients/clients.service";
import { ClientsController } from "../modules/clients/clients.controller";
import { createClientSchema, listClientsSchema, updateClientSchema } from "../modules/clients/clients.schemas";

import { ServicesRepository } from "../modules/services/services.repository";
import { ServicesService } from "../modules/services/services.service";
import { ServicesController } from "../modules/services/services.controller";
import { createServiceSchema, listServicesSchema } from "../modules/services/services.schemas";

import { OrdersRepository } from "../modules/orders/orders.repository";
import { OrdersService } from "../modules/orders/orders.service";
import { OrdersController } from "../modules/orders/orders.controller";
import { createOrderSchema, listOrdersSchema } from "../modules/orders/orders.schemas";

import { PaymentsRepository } from "../modules/payments/payments.repository";
import { PaymentsService } from "../modules/payments/payments.service";
import { PaymentsController } from "../modules/payments/payments.controller";
import { createPaymentSchema, deletePaymentSchema, listPaymentsSchema, updatePaymentSchema } from "../modules/payments/payments.schemas";

import { EmployeesRepository } from "../modules/employees/employees.repository";
import { EmployeesService } from "../modules/employees/employees.service";
import { EmployeesController } from "../modules/employees/employees.controller";
import { createEmployeeSchema, createVacationSchema, listEmployeesSchema } from "../modules/employees/employees.schemas";
import { SalariesRepository } from "../modules/salaries/salaries.repository";
import { SalariesService } from "../modules/salaries/salaries.service";
import { SalariesController } from "../modules/salaries/salaries.controller";
import { listSalariesSchema } from "../modules/salaries/salaries.schemas";
import { FinancialRepository } from "../modules/financial/financial.repository";
import { FinancialService } from "../modules/financial/financial.service";
import { FinancialController } from "../modules/financial/financial.controller";
import {
  createFinancialExpenseSchema,
  financialDashboardSchema,
  financialExpensesSchema,
  financialHistorySchema,
  financialSummarySchema,
  deleteFinancialExpenseSchema,
  recalculateFinancialSchema,
  reverseAllocationSchema,
  updateAllocationSettingsSchema
} from "../modules/financial/financial.schemas";
import { MaterialsRepository } from "../modules/materials/materials.repository";
import { MaterialsService } from "../modules/materials/materials.service";
import { MaterialsController } from "../modules/materials/materials.controller";
import {
  createMaterialSchema,
  createStockMovementSchema,
  listMaterialsSchema,
  stockHistorySchema
} from "../modules/materials/materials.schemas";
import { WorkHoursRepository } from "../modules/work-hours/work-hours.repository";
import { WorkHoursService } from "../modules/work-hours/work-hours.service";
import { WorkHoursController } from "../modules/work-hours/work-hours.controller";
import {
  createWorkHourSchema,
  deleteWorkHourSchema,
  listWorkHoursSchema,
  updateWorkHourSchema,
  workHoursStatsSchema
} from "../modules/work-hours/work-hours.schemas";
import { VideoQuotesRepository } from "../modules/video-quotes/video-quotes.repository";
import { VideoQuotesService } from "../modules/video-quotes/video-quotes.service";
import { VideoQuotesController } from "../modules/video-quotes/video-quotes.controller";
import { approveVideoQuoteSchema, listVideoQuotesSchema, videoQuoteDocumentParamsSchema, videoQuoteParamsSchema } from "../modules/video-quotes/video-quotes.schemas";

export function createRouter(): Router {
  const router = Router();

  const authController = new AuthController(new AuthService(new AuthRepository()));
  const clientsController = new ClientsController(new ClientsService(new ClientsRepository()));
  const servicesController = new ServicesController(new ServicesService(new ServicesRepository()));
  const ordersController = new OrdersController(new OrdersService(new OrdersRepository()));
  const paymentsController = new PaymentsController(new PaymentsService(new PaymentsRepository()));
  const employeesController = new EmployeesController(new EmployeesService(new EmployeesRepository()));
  const salariesController = new SalariesController(new SalariesService(new SalariesRepository()));
  const financialController = new FinancialController(new FinancialService(new FinancialRepository()));
  const materialsController = new MaterialsController(new MaterialsService(new MaterialsRepository()));
  const workHoursController = new WorkHoursController(new WorkHoursService(new WorkHoursRepository()));
  const videoQuotesController = new VideoQuotesController(new VideoQuotesService(new VideoQuotesRepository()));

  router.get("/health", (_req, res) => res.json({ ok: true }));

  router.post("/auth/register", validate(registerSchema), authController.register);
  router.post("/auth/login", validate(loginSchema), authController.login);
  router.post("/auth/refresh", validate(refreshSchema), verifyCsrf, authController.refresh);
  router.post("/auth/logout", authenticate, verifyCsrf, authController.logout);

  router.get("/clients", authenticate, validate(listClientsSchema), clientsController.list);
  router.post("/clients", authenticate, authorize("admin", "staff"), validate(createClientSchema), clientsController.create);
  router.put(
    "/clients/:clientId",
    authenticate,
    authorize("admin", "staff"),
    validate(updateClientSchema),
    clientsController.update
  );

  router.get("/services", authenticate, validate(listServicesSchema), servicesController.list);
  router.post("/services", authenticate, authorize("admin"), validate(createServiceSchema), servicesController.create);

  router.get("/orders", authenticate, validate(listOrdersSchema), ordersController.list);
  router.post("/orders", authenticate, authorize("admin", "staff"), validate(createOrderSchema), ordersController.create);

  router.get("/payments", authenticate, validate(listPaymentsSchema), paymentsController.list);
  router.post("/payments", authenticate, authorize("admin", "staff"), validate(createPaymentSchema), paymentsController.create);
  router.put(
    "/payments/:paymentId",
    authenticate,
    authorize("admin", "staff"),
    validate(updatePaymentSchema),
    paymentsController.update
  );
  router.delete(
    "/payments/:paymentId",
    authenticate,
    authorize("admin", "staff"),
    validate(deletePaymentSchema),
    paymentsController.delete
  );

  router.get("/financial/summary", authenticate, validate(financialSummarySchema), financialController.summary);
  router.get("/financial/dashboard", authenticate, validate(financialDashboardSchema), financialController.dashboard);
  router.get("/financial/history", authenticate, validate(financialHistorySchema), financialController.history);
  router.get("/financial/expenses", authenticate, validate(financialExpensesSchema), financialController.expenses);
  router.post(
    "/financial/expenses",
    authenticate,
    authorize("admin", "staff"),
    validate(createFinancialExpenseSchema),
    financialController.createExpense
  );
  router.delete(
    "/financial/expenses/:expenseId",
    authenticate,
    authorize("admin"),
    validate(deleteFinancialExpenseSchema),
    financialController.deleteExpense
  );
  router.patch(
    "/financial/settings",
    authenticate,
    authorize("admin"),
    validate(updateAllocationSettingsSchema),
    financialController.updateSettings
  );
  router.post(
    "/financial/recalculate",
    authenticate,
    authorize("admin"),
    validate(recalculateFinancialSchema),
    financialController.recalculate
  );
  router.post(
    "/financial/reverse/:paymentId",
    authenticate,
    authorize("admin"),
    validate(reverseAllocationSchema),
    financialController.reverse
  );

  router.get("/employees", authenticate, validate(listEmployeesSchema), employeesController.list);
  router.post("/employees", authenticate, authorize("admin"), validate(createEmployeeSchema), employeesController.create);
  router.post(
    "/employees/:employeeId/vacations",
    authenticate,
    authorize("admin"),
    validate(createVacationSchema),
    employeesController.createVacation
  );

  router.get("/salaries", authenticate, validate(listSalariesSchema), salariesController.list);

  router.get("/work-hours", authenticate, validate(listWorkHoursSchema), workHoursController.list);
  router.get("/work-hours/stats", authenticate, validate(workHoursStatsSchema), workHoursController.stats);
  router.post(
    "/work-hours",
    authenticate,
    authorize("admin", "staff"),
    validate(createWorkHourSchema),
    workHoursController.create
  );
  router.put(
    "/work-hours/:recordId",
    authenticate,
    authorize("admin", "staff"),
    validate(updateWorkHourSchema),
    workHoursController.update
  );
  router.delete(
    "/work-hours/:recordId",
    authenticate,
    authorize("admin", "staff"),
    validate(deleteWorkHourSchema),
    workHoursController.delete
  );

  router.get("/materials", authenticate, validate(listMaterialsSchema), materialsController.list);
  router.post("/materials", authenticate, authorize("admin", "staff"), validate(createMaterialSchema), materialsController.create);
  router.post(
    "/stock/movement",
    authenticate,
    authorize("admin", "staff"),
    validate(createStockMovementSchema),
    materialsController.movement
  );
  router.get("/stock/history", authenticate, validate(stockHistorySchema), materialsController.history);

  router.get("/video-quotes", authenticate, validate(listVideoQuotesSchema), videoQuotesController.list);
  router.get("/video-quotes/:quoteId", authenticate, validate(videoQuoteParamsSchema), videoQuotesController.get);
  router.post(
    "/video-quotes/analyze",
    authenticate,
    authorize("admin", "staff"),
    express.raw({ type: ["video/*", "application/octet-stream"], limit: "250mb" }),
    videoQuotesController.analyze
  );
  router.post(
    "/video-quotes/:quoteId/approve",
    authenticate,
    authorize("admin", "staff"),
    validate(approveVideoQuoteSchema),
    videoQuotesController.approve
  );
  router.get(
    "/video-quotes/:quoteId/document/:kind",
    authenticate,
    validate(videoQuoteDocumentParamsSchema),
    videoQuotesController.downloadDocument
  );

  return router;
}
