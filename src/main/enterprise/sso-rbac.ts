import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';

// ============================================================================
// SSO Provider
// ============================================================================

interface SsoConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  issuer: string;
  audience?: string;
}

interface SsoToken {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn: number;
  tokenType: string;
}

interface SsoCallbackData {
  code: string;
  state: string;
}

class SsoProvider extends EventEmitter {
  private config: Map<string, SsoConfig> = new Map();
  private tokenCache: Map<string, SsoToken> = new Map();
  private stateStore: Map<string, { nonce: string; createdAt: number }> = new Map();

  initiateSsoLogin(provider: 'saml' | 'oidc', config: SsoConfig): string {
    this.config.set(provider, config);

    if (provider === 'oidc') {
      return this.initiateOidcFlow(config);
    } else {
      return this.initiateSamlFlow(config);
    }
  }

  private initiateOidcFlow(config: SsoConfig): string {
    const state = randomBytes(32).toString('hex');
    const nonce = randomBytes(32).toString('hex');
    this.stateStore.set(state, { nonce, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      scope: 'openid profile email',
      redirect_uri: config.redirectUri,
      state,
      nonce,
    });

    return `${config.issuer}/authorize?${params.toString()}`;
  }

  private initiateSamlFlow(config: SsoConfig): string {
    const assertionId = randomBytes(16).toString('hex');
    const state = randomBytes(32).toString('hex');
    this.stateStore.set(state, { nonce: assertionId, createdAt: Date.now() });

    const params = new URLSearchParams({
      SAMLRequest: Buffer.from(
        `<AuthnRequest xmlns="urn:oasis:names:tc:SAML:2.0:protocol" ID="_${assertionId}">` +
          `<NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"/>` +
          `</AuthnRequest>`
      ).toString('base64'),
      RelayState: state,
    });

    return `${config.issuer}/sso?${params.toString()}`;
  }

  handleCallback(data: SsoCallbackData): SsoToken {
    const stateData = this.stateStore.get(data.state);
    if (!stateData) {
      throw new Error('Invalid or expired state parameter');
    }

    // Clean up expired states (older than 10 minutes)
    if (Date.now() - stateData.createdAt > 600000) {
      this.stateStore.delete(data.state);
      throw new Error('State parameter expired');
    }

    this.stateStore.delete(data.state);

    // Simulate token exchange (in production, would call token endpoint)
    const token: SsoToken = {
      accessToken: this.generateJwt('access'),
      refreshToken: randomBytes(32).toString('hex'),
      idToken: this.generateJwt('id'),
      expiresIn: 3600,
      tokenType: 'Bearer',
    };

    this.tokenCache.set(token.accessToken, token);
    return token;
  }

  validateToken(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return false;
      }

      if (payload.aud && !this.verifyAudience(payload.aud)) {
        return false;
      }

      if (payload.iss && !this.verifyIssuer(payload.iss)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  refreshToken(refreshToken: string): SsoToken {
    // Simulate token refresh
    const newToken: SsoToken = {
      accessToken: this.generateJwt('access'),
      refreshToken: randomBytes(32).toString('hex'),
      expiresIn: 3600,
      tokenType: 'Bearer',
    };

    this.tokenCache.set(newToken.accessToken, newToken);
    return newToken;
  }

  private generateJwt(type: 'access' | 'id'): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(
      JSON.stringify({
        sub: randomBytes(8).toString('hex'),
        aud: 'nyra-desktop',
        iss: 'https://auth.nyra.local',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        type,
      })
    ).toString('base64');

    const signature = createHash('sha256')
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${header}.${payload}.${signature}`;
  }

  private verifyAudience(aud: string): boolean {
    return aud === 'nyra-desktop' || aud === 'nyra-web';
  }

  private verifyIssuer(iss: string): boolean {
    return iss.includes('auth.nyra') || iss.includes('accounts.google.com');
  }
}

// ============================================================================
// RBAC Manager
// ============================================================================

type Role = 'owner' | 'admin' | 'member' | 'viewer' | 'guest';
type Permission =
  | 'manage_team'
  | 'manage_agents'
  | 'execute_agents'
  | 'view_results'
  | 'manage_billing'
  | 'manage_policies';

type RolePermissions = {
  [key in Role]: Permission[];
};

class RbacManager {
  private roleHierarchy: Record<Role, number> = {
    owner: 5,
    admin: 4,
    member: 3,
    viewer: 2,
    guest: 1,
  };

  private rolePermissions: RolePermissions = {
    owner: [
      'manage_team',
      'manage_agents',
      'execute_agents',
      'view_results',
      'manage_billing',
      'manage_policies',
    ] as Permission[],
    admin: [
      'manage_team',
      'manage_agents',
      'execute_agents',
      'view_results',
      'manage_billing',
    ] as Permission[],
    member: ['manage_agents', 'execute_agents', 'view_results'] as Permission[],
    viewer: ['view_results'] as Permission[],
    guest: [] as Permission[],
  };

  private userRoles: Map<string, Role[]> = new Map();

  assignRole(userId: string, role: Role): void {
    const currentRoles = this.userRoles.get(userId) || [];
    if (!currentRoles.includes(role)) {
      currentRoles.push(role);
      this.userRoles.set(userId, currentRoles);
    }
  }

  checkPermission(userId: string, permission: Permission): boolean {
    const roles = this.userRoles.get(userId) || [];
    return roles.some((role) => this.rolePermissions[role].includes(permission));
  }

  getUserRoles(userId: string): Role[] {
    return this.userRoles.get(userId) || [];
  }

  removeRole(userId: string, role: Role): void {
    const roles = this.userRoles.get(userId) || [];
    const filtered = roles.filter((r) => r !== role);
    if (filtered.length > 0) {
      this.userRoles.set(userId, filtered);
    } else {
      this.userRoles.delete(userId);
    }
  }

  hasHigherRole(userId1: string, userId2: string): boolean {
    const roles1 = this.userRoles.get(userId1) || [];
    const roles2 = this.userRoles.get(userId2) || [];

    const maxLevel1 = Math.max(...roles1.map((r) => this.roleHierarchy[r]), 0);
    const maxLevel2 = Math.max(...roles2.map((r) => this.roleHierarchy[r]), 0);

    return maxLevel1 > maxLevel2;
  }
}

// ============================================================================
// Team Manager
// ============================================================================

interface TeamMember {
  userId: string;
  email: string;
  role: Role;
  joinedAt: Date;
}

interface Team {
  id: string;
  name: string;
  ownerId: string;
  members: TeamMember[];
  createdAt: Date;
}

class TeamManager {
  private teams: Map<string, Team> = new Map();
  private rbacManager: RbacManager;
  private teamCounter = 0;

  constructor(rbacManager: RbacManager) {
    this.rbacManager = rbacManager;
  }

  createTeam(name: string, ownerId: string): Team {
    const teamId = `team_${++this.teamCounter}_${Date.now()}`;
    const team: Team = {
      id: teamId,
      name,
      ownerId,
      members: [
        {
          userId: ownerId,
          email: `owner_${ownerId}@team.local`,
          role: 'owner',
          joinedAt: new Date(),
        },
      ],
      createdAt: new Date(),
    };

    this.teams.set(teamId, team);
    this.rbacManager.assignRole(ownerId, 'owner');
    return team;
  }

  inviteMember(teamId: string, email: string, role: Role): TeamMember | null {
    const team = this.teams.get(teamId);
    if (!team) return null;

    const userId = `user_${randomBytes(8).toString('hex')}`;
    const member: TeamMember = {
      userId,
      email,
      role,
      joinedAt: new Date(),
    };

    team.members.push(member);
    this.rbacManager.assignRole(userId, role);
    return member;
  }

  removeMember(teamId: string, userId: string): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;

    const index = team.members.findIndex((m) => m.userId === userId);
    if (index === -1) return false;

    team.members.splice(index, 1);
    return true;
  }

  listMembers(teamId: string): TeamMember[] {
    const team = this.teams.get(teamId);
    return team ? team.members : [];
  }

  updateMemberRole(teamId: string, userId: string, newRole: Role): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;

    const member = team.members.find((m) => m.userId === userId);
    if (!member) return false;

    this.rbacManager.removeRole(userId, member.role);
    member.role = newRole;
    this.rbacManager.assignRole(userId, newRole);
    return true;
  }
}

// ============================================================================
// Singletons
// ============================================================================

const ssoProvider = new SsoProvider();
const rbacManager = new RbacManager();
const teamManager = new TeamManager(rbacManager);

export {
  SsoProvider,
  RbacManager,
  TeamManager,
  ssoProvider,
  rbacManager,
  teamManager,
  type Role,
  type Permission,
  type SsoConfig,
  type SsoToken,
  type TeamMember,
  type Team,
};
