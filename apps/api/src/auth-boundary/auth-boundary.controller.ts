import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createUserClient } from '@line-os/db/client';
import { PERMISSIONS } from '@line-os/core/permissions';
import { evaluateAuthBoundaryRequest } from './auth-boundary.service.js';
import { mapAuthBoundaryResultToHttpResponse } from './auth-boundary.response.js';

/**
 * LOCAL/DEV-ONLY SPIKE ENDPOINT (Phase 1J-1G). Not a permanent API surface.
 *
 * Proves the apps/api auth boundary end to end: verifies the caller's
 * Supabase access token, then checks a single HARDCODED permission
 * (`core.audit.read`) via the `api.has_permission` RPC. Returns only a safe,
 * non-PII JSON shape - never the access token, refresh token, email, auth
 * user id, membership id, role internals, permission array, or any raw
 * Supabase/Postgres error.
 *
 * See docs/phase-1j-1c-apps-api-auth-boundary-spike-plan.md and
 * docs/phase-1j-1e-api-facade-permission-resolution-design.md.
 */
@Controller('auth-boundary')
export class AuthBoundaryTestController {
  @Get('test')
  async test(
    @Headers('authorization') authorization: string | undefined,
    @Query('tenant_id') tenantId: string | undefined,
    @Query('location_id') locationId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await evaluateAuthBoundaryRequest(
      {
        authorizationHeader: authorization,
        tenantIdParam: tenantId,
        locationIdParam: locationId,
      },
      PERMISSIONS.core.auditRead,
      createUserClient,
    );

    const { status, body } = mapAuthBoundaryResultToHttpResponse(result, PERMISSIONS.core.auditRead);
    res.status(status).json(body);
  }
}
