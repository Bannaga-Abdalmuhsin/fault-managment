import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sitesRouter from "./sites";
import ticketsRouter from "./tickets";
import dashboardRouter from "./dashboard";
import powerbiRouter from "./powerbi";
import authRouter from "./auth";
import riskRouter from "./risk";
import faultsRouter from "./faults";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(sitesRouter);
router.use(ticketsRouter);
router.use(dashboardRouter);
router.use(powerbiRouter);
router.use(riskRouter);
router.use(faultsRouter);

export default router;
