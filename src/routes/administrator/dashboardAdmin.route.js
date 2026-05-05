
import { Router } from "express";
import { getAdminDashboardStats } from "../../controllers/administrator/dashboardAdmin.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const routerAdminDashboardStats = Router();

// Agrupamos las rutas que comparten el mismo path
routerAdminDashboardStats.get("/admin/dashboard-stats", verifyToken, getAdminDashboardStats);

export default routerAdminDashboardStats;