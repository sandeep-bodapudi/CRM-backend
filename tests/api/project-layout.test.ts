import fs from 'fs';
import path from 'path';
import { prisma } from '../../apps/api/src/lib/prisma';
import { ProjectService } from '../../apps/api/src/services/project.service';
import { Roles, ALL_PERMISSIONS } from '@rrh-ems/shared';
import { TokenPayload } from '../../apps/api/src/utils/jwt';

// A minimal valid 1x1 PNG, used as the upload payload — processImageBuffer
// (sharp) needs a real decodable image, not an arbitrary buffer.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

// Phase 2.21/2.23 (2026-09-06): layout image + unit-pin endpoints. Regions
// deliberately carry no status — the viewer derives that live from the
// ProjectUnit's sales_status, joined through listLayoutImages (2026-11-02:
// pins moved from the old Property units to ProjectUnit).
describe('Phase 2.21/2.23 - Project layout images and unit regions', () => {
  const companyId = 1;
  const mockAdmin: TokenPayload = {
    employeeId: 8880997,
    employeeCode: 'ADMIN-2-23',
    companyId,
    branchId: null,
    roles: [Roles.MD],
    permissions: ALL_PERMISSIONS,
  };
  const projectId = 8880299;
  const unitId = 8880298;
  const uploadedImageUrls: string[] = [];

  beforeAll(async () => {
    await prisma.employee.create({
      data: {
        id: mockAdmin.employeeId,
        employee_code: 'ADMIN-2-23',
        company_id: companyId,
        password_hash: '',
        status: 'ACTIVE',
        full_name: 'Phase 2.23 Test Admin',
      },
    });
    await prisma.project.create({
      data: {
        id: projectId,
        project_code: `TEST-2-23-${Date.now()}`,
        company_id: companyId,
        name: 'Phase 2.23 Layout Test Project',
        location: 'Test Location',
        slug: `test-2-23-${Date.now()}`,
      },
    });
    await prisma.projectUnit.create({
      data: {
        id: unitId,
        unit_code: `UNIT-2-23-${Date.now()}`,
        unit_number: 'L-1',
        unit_type: 'PLOT',
        company_id: companyId,
        project_id: projectId,
        plot_area_sqyd: 150,
        final_price: 1000000,
        sales_status: 'AVAILABLE',
      },
    });
  });

  afterAll(async () => {
    await prisma.propertyLayoutRegion.deleteMany({ where: { project_unit_id: unitId } });
    await prisma.projectLayoutImage.deleteMany({ where: { project_id: projectId } });
    await prisma.projectUnit.delete({ where: { id: unitId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.employee.delete({ where: { id: mockAdmin.employeeId } });
    for (const url of uploadedImageUrls) {
      const filePath = path.join(process.cwd(), url.replace(/^\//, ''));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('1. Uploads a layout image; the first upload for a project becomes primary', async () => {
    const image = await ProjectService.uploadLayoutImage(
      mockAdmin,
      projectId,
      { buffer: TINY_PNG, originalname: 'plan.png', mimetype: 'image/png' },
      'Master Plan',
    );
    uploadedImageUrls.push(image.image_url);
    expect(image.is_primary).toBe(true);
    expect(image.title).toBe('Master Plan');
    expect(image.project_id).toBe(projectId);
  });

  it('2. Saves a pin (region) linking the image to the unit', async () => {
    const images = await ProjectService.listLayoutImages(mockAdmin, projectId);
    const imageId = images[0].id;

    const result = await ProjectService.upsertLayoutRegions(mockAdmin, projectId, imageId, [
      { project_unit_id: unitId, x: 0.42, y: 0.17 },
    ]);
    expect(result.saved).toBe(1);
    expect(result.failed).toHaveLength(0);
  });

  it('3. Listing images joins the region to the live unit sales status (no separate status stored on the region)', async () => {
    const images = await ProjectService.listLayoutImages(mockAdmin, projectId);
    const region = images[0].regions[0];
    expect(region.x).toBe(0.42);
    expect(region.y).toBe(0.17);
    expect((region as any).project_unit.sales_status).toBe('AVAILABLE');

    // Confirm the region schema itself has no status/color field to drift out of sync.
    expect(region).not.toHaveProperty('status');
    expect(region).not.toHaveProperty('color');
  });

  it('4. Rejects a region for a property that is not a unit of this project', async () => {
    const images = await ProjectService.listLayoutImages(mockAdmin, projectId);
    const imageId = images[0].id;
    const result = await ProjectService.upsertLayoutRegions(mockAdmin, projectId, imageId, [
      { project_unit_id: 999999999, x: 0.5, y: 0.5 },
    ]);
    expect(result.saved).toBe(0);
    expect(result.failed).toHaveLength(1);
  });

  it('5. Re-saving a region for the same unit updates it in place (unique on image+property)', async () => {
    const images = await ProjectService.listLayoutImages(mockAdmin, projectId);
    const imageId = images[0].id;
    await ProjectService.upsertLayoutRegions(mockAdmin, projectId, imageId, [
      { project_unit_id: unitId, x: 0.9, y: 0.1 },
    ]);

    const updated = await ProjectService.listLayoutImages(mockAdmin, projectId);
    expect(updated[0].regions).toHaveLength(1); // still one region, not a duplicate
    expect(updated[0].regions[0].x).toBe(0.9);
  });

  it('6. Deletes a single region', async () => {
    const images = await ProjectService.listLayoutImages(mockAdmin, projectId);
    const regionId = images[0].regions[0].id;
    await ProjectService.deleteLayoutRegion(mockAdmin, regionId);

    const after = await ProjectService.listLayoutImages(mockAdmin, projectId);
    expect(after[0].regions).toHaveLength(0);
  });

  it('7. Deletes the layout image', async () => {
    const images = await ProjectService.listLayoutImages(mockAdmin, projectId);
    await ProjectService.deleteLayoutImage(mockAdmin, projectId, images[0].id);

    const after = await ProjectService.listLayoutImages(mockAdmin, projectId);
    expect(after).toHaveLength(0);
    uploadedImageUrls.length = 0; // already deleted by the service
  });
});
