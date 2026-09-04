import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, requireRole } from "./replitAuth";
import { 
  insertOwnerSchema,
  insertPatientSchema,
  insertAppointmentSchema,
  insertMedicalRecordSchema,
  insertTreatmentSchema,
  insertInvoiceSchema,
  insertInvoiceItemSchema,
  insertInventoryItemSchema,
} from "@shared/schema";
import { z } from "zod";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage.js";
import { ObjectPermission } from "./objectAcl.js";

function normalizeDateOnlyFields<T extends Record<string, any>>(data: T, fields: string[]): T {
  const normalized: Record<string, any> = { ...data };
  for (const field of fields) {
    if (normalized[field] === "") {
      normalized[field] = null;
    }
  }
  return normalized as T;
}

function normalizeDateTimeFields<T extends Record<string, any>>(data: T, fields: string[]): T {
  const normalized: Record<string, any> = { ...data };
  for (const field of fields) {
    const value = normalized[field];
    if (value === "") {
      normalized[field] = null;
    } else if (typeof value === "string") {
      normalized[field] = new Date(value);
    }
  }
  return normalized as T;
}

// Invoice creation: totals are computed server-side from these line items,
// never taken from the client (financial integrity). `.strict()` rejects any
// client-sent amount fields (subtotal/taxAmount/totalAmount).
const createInvoiceRequestSchema = z.object({
  ownerId: z.string().min(1),
  patientId: z.string().min(1).optional().nullable(),
  appointmentId: z.string().min(1).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
  taxRate: z.number().min(0).max(1).optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
        treatmentId: z.string().min(1).optional().nullable(),
        inventoryItemId: z.string().min(1).optional().nullable(),
      })
    )
    .min(1)
    .max(100),
}).strict();

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes  
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard routes
  app.get("/api/dashboard/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/dashboard/today-appointments", isAuthenticated, async (req, res) => {
    try {
      const appointments = await storage.getTodayAppointments();
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching today's appointments:", error);
      res.status(500).json({ message: "Failed to fetch today's appointments" });
    }
  });

  app.get("/api/dashboard/recent-activity", isAuthenticated, async (req, res) => {
    try {
      const activity = await storage.getRecentActivity();
      res.json(activity);
    } catch (error) {
      console.error("Error fetching recent activity:", error);
      res.status(500).json({ message: "Failed to fetch recent activity" });
    }
  });

  // Owner routes
  app.get("/api/owners", isAuthenticated, async (req, res) => {
    try {
      const owners = await storage.getOwners();
      res.json(owners);
    } catch (error) {
      console.error("Error fetching owners:", error);
      res.status(500).json({ message: "Failed to fetch owners" });
    }
  });

  // Walk-in ("Público General") customer for counter sales. Get-or-create.
  app.get("/api/public-owner", isAuthenticated, async (_req, res) => {
    try {
      const owner = await storage.getOrCreatePublicOwner();
      res.json(owner);
    } catch (error) {
      console.error("Error fetching public owner:", error);
      res.status(500).json({ message: "Failed to fetch public owner" });
    }
  });

  app.get("/api/owners/:id", isAuthenticated, async (req, res) => {
    try {
      const owner = await storage.getOwner(req.params.id);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }
      res.json(owner);
    } catch (error) {
      console.error("Error fetching owner:", error);
      res.status(500).json({ message: "Failed to fetch owner" });
    }
  });

  app.post("/api/owners", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertOwnerSchema.parse(req.body);
      const owner = await storage.createOwner(validatedData);
      res.status(201).json(owner);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating owner:", error);
      res.status(500).json({ message: "Failed to create owner" });
    }
  });

  app.put("/api/owners/:id", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertOwnerSchema.partial().parse(req.body);
      const owner = await storage.updateOwner(req.params.id, validatedData);
      res.json(owner);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating owner:", error);
      res.status(500).json({ message: "Failed to update owner" });
    }
  });

  app.delete("/api/owners/:id", isAuthenticated, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteOwner(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting owner:", error);
      res.status(500).json({ message: "Failed to delete owner" });
    }
  });

  // Patient routes
  app.get("/api/patients", isAuthenticated, async (req, res) => {
    try {
      const patients = await storage.getPatients();
      res.json(patients);
    } catch (error) {
      console.error("Error fetching patients:", error);
      res.status(500).json({ message: "Failed to fetch patients" });
    }
  });

  app.get("/api/patients/:id", isAuthenticated, async (req, res) => {
    try {
      const patient = await storage.getPatient(req.params.id);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }
      res.json(patient);
    } catch (error) {
      console.error("Error fetching patient:", error);
      res.status(500).json({ message: "Failed to fetch patient" });
    }
  });

  app.get("/api/owners/:ownerId/patients", isAuthenticated, async (req, res) => {
    try {
      const patients = await storage.getPatientsByOwner(req.params.ownerId);
      res.json(patients);
    } catch (error) {
      console.error("Error fetching owner's patients:", error);
      res.status(500).json({ message: "Failed to fetch owner's patients" });
    }
  });

  app.post("/api/patients", isAuthenticated, async (req, res) => {
    try {
      const payload = normalizeDateOnlyFields(req.body, ["birthDate"]);
      const validatedData = insertPatientSchema.parse(payload);
      const patient = await storage.createPatient(validatedData);
      res.status(201).json(patient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating patient:", error);
      res.status(500).json({ message: "Failed to create patient" });
    }
  });

  app.put("/api/patients/:id", isAuthenticated, async (req, res) => {
    try {
      const payload = normalizeDateOnlyFields(req.body, ["birthDate"]);
      const validatedData = insertPatientSchema.partial().parse(payload);
      // Never overwrite a FK field with an empty string — ignore it so the
      // existing value is preserved (happens when photo-save triggers a partial update)
      if (!validatedData.ownerId) delete (validatedData as any).ownerId;
      const patient = await storage.updatePatient(req.params.id, validatedData);
      res.json(patient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating patient:", error);
      res.status(500).json({ message: "Failed to update patient" });
    }
  });

  app.delete("/api/patients/:id", isAuthenticated, requireRole("admin"), async (req, res) => {
    try {
      await storage.deletePatient(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting patient:", error);
      res.status(500).json({ message: "Failed to delete patient" });
    }
  });

  // Appointment routes
  app.get("/api/appointments", isAuthenticated, async (req, res) => {
    try {
      const appointments = await storage.getAppointments();
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  app.get("/api/appointments/:id", isAuthenticated, async (req, res) => {
    try {
      const appointment = await storage.getAppointment(req.params.id);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error) {
      console.error("Error fetching appointment:", error);
      res.status(500).json({ message: "Failed to fetch appointment" });
    }
  });

  // Schema that coerces appointmentDate from ISO string or Date
  const appointmentCoercedSchema = insertAppointmentSchema.extend({
    appointmentDate: z.coerce.date(),
  });

  app.post("/api/appointments", isAuthenticated, async (req, res) => {
    try {
      const validatedData = appointmentCoercedSchema.parse(req.body);
      const appointment = await storage.createAppointment(validatedData);
      res.status(201).json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Appointment validation error:", JSON.stringify(error.errors));
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating appointment:", error);
      res.status(500).json({ message: "Failed to create appointment" });
    }
  });

  app.put("/api/appointments/:id", isAuthenticated, async (req, res) => {
    try {
      const validatedData = appointmentCoercedSchema.partial().parse(req.body);
      const appointment = await storage.updateAppointment(req.params.id, validatedData);
      res.json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating appointment:", error);
      res.status(500).json({ message: "Failed to update appointment" });
    }
  });

  app.delete("/api/appointments/:id", isAuthenticated, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteAppointment(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting appointment:", error);
      res.status(500).json({ message: "Failed to delete appointment" });
    }
  });

  // Medical record routes
  app.get("/api/medical-records", isAuthenticated, async (req, res) => {
    try {
      const records = await storage.getMedicalRecords();
      res.json(records);
    } catch (error) {
      console.error("Error fetching medical records:", error);
      res.status(500).json({ message: "Failed to fetch medical records" });
    }
  });

  app.get("/api/patients/:patientId/medical-records", isAuthenticated, async (req, res) => {
    try {
      const records = await storage.getPatientMedicalRecords(req.params.patientId);
      res.json(records);
    } catch (error) {
      console.error("Error fetching patient medical records:", error);
      res.status(500).json({ message: "Failed to fetch patient medical records" });
    }
  });

  app.post("/api/medical-records", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertMedicalRecordSchema.parse(req.body);
      const record = await storage.createMedicalRecord(validatedData);
      res.status(201).json(record);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating medical record:", error);
      res.status(500).json({ message: "Failed to create medical record" });
    }
  });

  // Treatment routes
  app.get("/api/treatments", isAuthenticated, async (req, res) => {
    try {
      const treatments = await storage.getTreatments();
      res.json(treatments);
    } catch (error) {
      console.error("Error fetching treatments:", error);
      res.status(500).json({ message: "Failed to fetch treatments" });
    }
  });

  app.post("/api/treatments", isAuthenticated, requireRole("admin"), async (req, res) => {
    try {
      const validatedData = insertTreatmentSchema.parse(req.body);
      const treatment = await storage.createTreatment(validatedData);
      res.status(201).json(treatment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating treatment:", error);
      res.status(500).json({ message: "Failed to create treatment" });
    }
  });

  app.put("/api/treatments/:id", isAuthenticated, requireRole("admin"), async (req, res) => {
    try {
      const validatedData = insertTreatmentSchema.partial().parse(req.body);
      const treatment = await storage.updateTreatment(req.params.id, validatedData);
      res.json(treatment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating treatment:", error);
      res.status(500).json({ message: "Failed to update treatment" });
    }
  });

  app.delete("/api/treatments/:id", isAuthenticated, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteTreatment(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting treatment:", error);
      res.status(500).json({ message: "Failed to delete treatment" });
    }
  });

  // Invoice routes
  app.get("/api/invoices", isAuthenticated, async (req, res) => {
    try {
      const invoices = await storage.getInvoices();
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get("/api/invoices/:id", isAuthenticated, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json(invoice);
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  app.post("/api/invoices", isAuthenticated, async (req, res) => {
    try {
      const data = createInvoiceRequestSchema.parse(req.body);
      if (data.appointmentId) {
        const existingInvoice = await storage.getInvoiceByAppointment(data.appointmentId);
        if (existingInvoice) {
          return res.status(409).json({
            message: "This appointment already has an invoice",
            invoice: existingInvoice,
          });
        }
      }
      const invoice = await storage.createInvoiceWithItems(data);
      res.status(201).json(invoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      if (error instanceof Error && error.message === "APPOINTMENT_ALREADY_INVOICED") {
        return res.status(409).json({ message: "This appointment already has an invoice" });
      }
      if (error instanceof Error && error.message.startsWith("INSUFFICIENT_STOCK:")) {
        const inventoryItemId = error.message.split(":")[1];
        return res.status(409).json({
          message: "No hay stock suficiente para uno de los productos.",
          code: "INSUFFICIENT_STOCK",
          inventoryItemId,
        });
      }
      if (error instanceof Error && error.message.startsWith("INVENTORY_ITEM_NOT_FOUND:")) {
        return res.status(400).json({ message: "Producto de inventario no encontrado." });
      }
      console.error("Error creating invoice:", error);
      res.status(500).json({ message: "Failed to create invoice" });
    }
  });

  app.put("/api/invoices/:id", isAuthenticated, async (req, res) => {
    try {
      const payload = normalizeDateTimeFields(req.body, ["issueDate", "dueDate", "paymentDate"]);
      const validatedData = insertInvoiceSchema.partial().parse(payload);
      const invoice = await storage.updateInvoice(req.params.id, validatedData);
      res.json(invoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating invoice:", error);
      res.status(500).json({ message: "Failed to update invoice" });
    }
  });

  app.post("/api/invoices/:id/items", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertInvoiceItemSchema.parse({
        ...req.body,
        invoiceId: req.params.id
      });
      const item = await storage.addInvoiceItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error adding invoice item:", error);
      res.status(500).json({ message: "Failed to add invoice item" });
    }
  });

  app.delete("/api/invoices/:id", isAuthenticated, requireRole("admin"), async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      await storage.deleteInvoice(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      res.status(500).json({ message: "Failed to delete invoice" });
    }
  });

  // Inventory routes
  app.get("/api/inventory", isAuthenticated, async (req, res) => {
    try {
      const items = await storage.getInventoryItems();
      res.json(items);
    } catch (error) {
      console.error("Error fetching inventory items:", error);
      res.status(500).json({ message: "Failed to fetch inventory items" });
    }
  });

  app.get("/api/inventory/low-stock", isAuthenticated, async (req, res) => {
    try {
      const items = await storage.getLowStockItems();
      res.json(items);
    } catch (error) {
      console.error("Error fetching low stock items:", error);
      res.status(500).json({ message: "Failed to fetch low stock items" });
    }
  });

  app.post("/api/inventory", isAuthenticated, requireRole("admin"), async (req, res) => {
    try {
      const validatedData = insertInventoryItemSchema.parse(req.body);
      const item = await storage.createInventoryItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating inventory item:", error);
      res.status(500).json({ message: "Failed to create inventory item" });
    }
  });

  app.put("/api/inventory/:id", isAuthenticated, requireRole("admin"), async (req, res) => {
    try {
      const validatedData = insertInventoryItemSchema.partial().parse(req.body);
      const item = await storage.updateInventoryItem(req.params.id, validatedData);
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating inventory item:", error);
      res.status(500).json({ message: "Failed to update inventory item" });
    }
  });

  app.delete("/api/inventory/:id", isAuthenticated, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteInventoryItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting inventory item:", error);
      res.status(500).json({ message: "Failed to delete inventory item" });
    }
  });

  // Object storage routes for photos
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(
        req.path,
      );
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    res.json({ uploadURL });
  });

  app.put("/api/patient-photos", isAuthenticated, async (req, res) => {
    if (!req.body.patientId || !req.body.photoURL) {
      return res.status(400).json({ error: "patientId and photoURL are required" });
    }

    const userId = (req.user as any)?.claims?.sub;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.photoURL,
        {
          owner: userId,
          visibility: "private", // Patient photos should be private
        },
      );

      // Update patient with photo path
      await storage.updatePatient(req.body.patientId, { photoUrl: objectPath });

      res.status(200).json({
        objectPath: objectPath,
      });
    } catch (error) {
      console.error("Error setting patient photo:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/owner-photos", isAuthenticated, async (req, res) => {
    if (!req.body.ownerId || !req.body.photoURL) {
      return res.status(400).json({ error: "ownerId and photoURL are required" });
    }

    const userId = (req.user as any)?.claims?.sub;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.photoURL,
        {
          owner: userId,
          visibility: "private", // Owner photos should be private
        },
      );

      // Update owner with photo path
      await storage.updateOwner(req.body.ownerId, { photoUrl: objectPath });

      res.status(200).json({
        objectPath: objectPath,
      });
    } catch (error) {
      console.error("Error setting owner photo:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
