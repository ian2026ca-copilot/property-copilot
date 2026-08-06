from fastapi import APIRouter
from app.api.v1.endpoints import auth, properties, tenants, payments, maintenance, team, images, leases, vendors, units, campaigns, billing, admin, copilot

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(properties.router)
router.include_router(tenants.router)
router.include_router(leases.router)
router.include_router(payments.router)
router.include_router(maintenance.router)
router.include_router(vendors.router)
router.include_router(team.router)
router.include_router(images.router)
router.include_router(units.router)
router.include_router(campaigns.router)
router.include_router(billing.router)
router.include_router(admin.router)
router.include_router(copilot.router)
