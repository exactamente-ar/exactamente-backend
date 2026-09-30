import { describe, it, expect } from 'bun:test';
import adminBlogsApp from '@/routes/admin/blogs';
import { signToken } from '@/services/auth.service';

async function token(role: 'user' | 'admin') {
  return signToken({ sub: 'u1', role, facultyId: null });
}

describe('admin/blogs', () => {
  it('GET /activity requiere token (401)', async () => {
    const res = await adminBlogsApp.request('/activity');
    expect(res.status).toBe(401);
  });

  it('GET /activity rechaza rol user (403)', async () => {
    const res = await adminBlogsApp.request('/activity', {
      headers: { Authorization: `Bearer ${await token('user')}` },
    });
    expect(res.status).toBe(403);
  });

  it('DELETE /subtopics/:id sin token (401)', async () => {
    const res = await adminBlogsApp.request('/subtopics/st1', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});
