import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole, JwtPayload } from '../types';
declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: JwtPayload;
        user: JwtPayload;
    }
}
export declare function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void>;
export declare function requireRole(...roles: UserRole[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export declare function requireVerifiedDoctor(request: FastifyRequest, reply: FastifyReply): Promise<void>;
export declare function requireSameClinic(request: FastifyRequest, reply: FastifyReply, clinicId: string): Promise<boolean>;
//# sourceMappingURL=requireAuth.d.ts.map