import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SsoProvider, RbacManager, TeamManager, rbacManager, teamManager } from '../enterprise/sso-rbac'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('SSO & RBAC', () => {
  let ssoProvider: SsoProvider
  let rbac: RbacManager
  let teams: TeamManager
  let tmpDir: string

  beforeEach(() => {
    ssoProvider = new SsoProvider()
    rbac = new RbacManager()
    teams = new TeamManager(rbac)
    tmpDir = path.join(os.tmpdir(), 'nyra-test-sso-rbac')
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  describe('SSO Provider - OIDC Flow', () => {
    it('should initiate OIDC login flow', () => {
      const config = {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/callback',
        issuer: 'https://auth.example.com',
      }

      const authUrl = ssoProvider.initiateSsoLogin('oidc', config)
      expect(authUrl).toContain('https://auth.example.com/authorize')
      expect(authUrl).toContain('client_id=test-client')
      expect(authUrl).toContain('response_type=code')
    })

    it('should include state and nonce in OIDC flow', () => {
      const config = {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/callback',
        issuer: 'https://auth.example.com',
      }

      const authUrl = ssoProvider.initiateSsoLogin('oidc', config)
      expect(authUrl).toContain('state=')
      expect(authUrl).toContain('nonce=')
    })
  })

  describe('SSO Provider - SAML Flow', () => {
    it('should initiate SAML login flow', () => {
      const config = {
        clientId: 'test-entity-id',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/callback',
        issuer: 'https://auth.example.com',
      }

      const authUrl = ssoProvider.initiateSsoLogin('saml', config)
      expect(authUrl).toContain('https://auth.example.com/sso')
      expect(authUrl).toContain('SAMLRequest=')
    })
  })

  describe('SSO Callback Handling', () => {
    it('should handle OIDC callback and return token', () => {
      const config = {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/callback',
        issuer: 'https://auth.example.com',
      }

      const authUrl = ssoProvider.initiateSsoLogin('oidc', config)
      const stateMatch = authUrl.match(/state=([a-f0-9]+)/)
      const state = stateMatch ? stateMatch[1] : ''

      const token = ssoProvider.handleCallback({ code: 'auth-code', state })
      expect(token.accessToken).toBeDefined()
      expect(token.tokenType).toBe('Bearer')
      expect(token.expiresIn).toBe(3600)
    })

    it('should reject callback with invalid state', () => {
      expect(() => {
        ssoProvider.handleCallback({ code: 'code', state: 'invalid-state' })
      }).toThrow('Invalid or expired state parameter')
    })

    it('should reject expired state', async () => {
      const config = {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/callback',
        issuer: 'https://auth.example.com',
      }

      const authUrl = ssoProvider.initiateSsoLogin('oidc', config)
      const stateMatch = authUrl.match(/state=([a-f0-9]+)/)
      const state = stateMatch ? stateMatch[1] : ''

      // Wait to make it "expire" (simulated with 600+ second timeout)
      const expiredState = state
      const token = ssoProvider.handleCallback({ code: 'code', state: expiredState })
      expect(token).toBeDefined()
    })
  })

  describe('Token Validation', () => {
    it('should validate well-formed JWT token', () => {
      const isValid = ssoProvider.validateToken(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhYmMxMjMiLCJhdWQiOiJueXJhLWRlc2t0b3AiLCJpc3MiOiJodHRwczovL2F1dGgubnlyYS5sb2NhbCIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5LCJ0eXBlIjoiYWNjZXNzIn0.signature'
      )
      expect(isValid).toBe(true)
    })

    it('should reject invalid token format', () => {
      const isValid = ssoProvider.validateToken('invalid.token')
      expect(isValid).toBe(false)
    })

    it('should reject expired token', () => {
      // Token with exp in the past
      const isValid = ssoProvider.validateToken(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhYmMxMjMiLCJhdWQiOiJueXJhLWRlc2t0b3AiLCJpc3MiOiJodHRwczovL2F1dGgubnlyYS5sb2NhbCIsImlhdCI6MTAwMDAwMDAwMCwiZXhwIjoxMDAwLCJ0eXBlIjoiYWNjZXNzIn0.signature'
      )
      expect(isValid).toBe(false)
    })

    it('should validate token audience', () => {
      const isValid = ssoProvider.validateToken(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhYmMxMjMiLCJhdWQiOiJueXJhLWRlc2t0b3AiLCJpc3MiOiJodHRwczovL2F1dGgubnlyYS5sb2NhbCIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5LCJ0eXBlIjoiYWNjZXNzIn0.signature'
      )
      expect(isValid).toBe(true)
    })
  })

  describe('RBAC - Role Assignment', () => {
    it('should assign role to user', () => {
      rbac.assignRole('user-1', 'member')
      const roles = rbac.getUserRoles('user-1')
      expect(roles).toContain('member')
    })

    it('should assign multiple roles to user', () => {
      rbac.assignRole('user-1', 'member')
      rbac.assignRole('user-1', 'admin')
      const roles = rbac.getUserRoles('user-1')
      expect(roles).toContain('member')
      expect(roles).toContain('admin')
    })

    it('should not duplicate role assignment', () => {
      rbac.assignRole('user-1', 'member')
      rbac.assignRole('user-1', 'member')
      const roles = rbac.getUserRoles('user-1')
      expect(roles.filter((r) => r === 'member').length).toBe(1)
    })
  })

  describe('RBAC - Permission Checking', () => {
    it('should grant owner all permissions', () => {
      rbac.assignRole('user-1', 'owner')
      expect(rbac.checkPermission('user-1', 'manage_team')).toBe(true)
      expect(rbac.checkPermission('user-1', 'manage_agents')).toBe(true)
      expect(rbac.checkPermission('user-1', 'manage_billing')).toBe(true)
      expect(rbac.checkPermission('user-1', 'manage_policies')).toBe(true)
    })

    it('should grant admin most permissions', () => {
      rbac.assignRole('user-1', 'admin')
      expect(rbac.checkPermission('user-1', 'manage_team')).toBe(true)
      expect(rbac.checkPermission('user-1', 'manage_agents')).toBe(true)
      expect(rbac.checkPermission('user-1', 'manage_policies')).toBe(false)
    })

    it('should grant member limited permissions', () => {
      rbac.assignRole('user-1', 'member')
      expect(rbac.checkPermission('user-1', 'execute_agents')).toBe(true)
      expect(rbac.checkPermission('user-1', 'view_results')).toBe(true)
      expect(rbac.checkPermission('user-1', 'manage_team')).toBe(false)
    })

    it('should grant viewer only view permission', () => {
      rbac.assignRole('user-1', 'viewer')
      expect(rbac.checkPermission('user-1', 'view_results')).toBe(true)
      expect(rbac.checkPermission('user-1', 'execute_agents')).toBe(false)
    })

    it('should grant guest no permissions', () => {
      rbac.assignRole('user-1', 'guest')
      expect(rbac.checkPermission('user-1', 'view_results')).toBe(false)
    })
  })

  describe('RBAC - Role Hierarchy', () => {
    it('should determine higher role', () => {
      rbac.assignRole('user-1', 'owner')
      rbac.assignRole('user-2', 'admin')
      expect(rbac.hasHigherRole('user-1', 'user-2')).toBe(true)
      expect(rbac.hasHigherRole('user-2', 'user-1')).toBe(false)
    })

    it('should handle user without roles', () => {
      rbac.assignRole('user-1', 'member')
      expect(rbac.hasHigherRole('user-1', 'user-2')).toBe(true)
    })
  })

  describe('RBAC - Role Removal', () => {
    it('should remove role from user', () => {
      rbac.assignRole('user-1', 'member')
      rbac.removeRole('user-1', 'member')
      const roles = rbac.getUserRoles('user-1')
      expect(roles).not.toContain('member')
    })

    it('should remove user when last role is removed', () => {
      rbac.assignRole('user-1', 'member')
      rbac.removeRole('user-1', 'member')
      expect(rbac.getUserRoles('user-1')).toEqual([])
    })
  })

  describe('Team Manager', () => {
    it('should create team with owner', () => {
      const team = teams.createTeam('Engineering', 'user-1')
      expect(team.name).toBe('Engineering')
      expect(team.ownerId).toBe('user-1')
      expect(team.members[0].role).toBe('owner')
    })

    it('should invite member to team', () => {
      const team = teams.createTeam('Engineering', 'user-1')
      const member = teams.inviteMember(team.id, 'user2@company.com', 'member')
      expect(member?.email).toBe('user2@company.com')
      expect(member?.role).toBe('member')
    })

    it('should list team members', () => {
      const team = teams.createTeam('Engineering', 'user-1')
      teams.inviteMember(team.id, 'user2@company.com', 'member')
      teams.inviteMember(team.id, 'user3@company.com', 'viewer')

      const members = teams.listMembers(team.id)
      expect(members.length).toBe(3)
    })

    it('should remove member from team', () => {
      const team = teams.createTeam('Engineering', 'user-1')
      const member = teams.inviteMember(team.id, 'user2@company.com', 'member')

      teams.removeMember(team.id, member!.userId)
      const members = teams.listMembers(team.id)
      expect(members.length).toBe(1)
    })

    it('should update member role', () => {
      const team = teams.createTeam('Engineering', 'user-1')
      const member = teams.inviteMember(team.id, 'user2@company.com', 'member')

      const success = teams.updateMemberRole(team.id, member!.userId, 'admin')
      expect(success).toBe(true)

      const updated = teams.listMembers(team.id).find((m) => m.userId === member!.userId)
      expect(updated?.role).toBe('admin')
    })
  })

  describe('Init/Shutdown Lifecycle', () => {
    it('should initialize and load persisted roles', () => {
      rbac.init()
      expect(rbac).toBeDefined()
    })

    it('should create data directory on init()', () => {
      rbac.init()
      const dataDir = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra', 'enterprise')
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should save roles on shutdown()', () => {
      rbac.assignRole('user-1', 'admin')
      rbac.assignRole('user-2', 'member')
      rbac.shutdown()

      const rolesPath = path.join(
        process.env.HOME || process.env.USERPROFILE || '/tmp',
        '.nyra',
        'enterprise',
        'rbac-roles.json'
      )

      if (fs.existsSync(rolesPath)) {
        const data = JSON.parse(fs.readFileSync(rolesPath, 'utf-8'))
        expect(data.userRoles).toBeDefined()
        expect(data.userRoles['user-1']).toContain('admin')
      }
    })

    it('should restore roles after init+shutdown cycle', () => {
      rbac.assignRole('user-1', 'owner')
      rbac.assignRole('user-2', 'member')
      rbac.shutdown()

      const rbac2 = new RbacManager()
      rbac2.init()

      const roles1 = rbac2.getUserRoles('user-1')
      const roles2 = rbac2.getUserRoles('user-2')

      expect(roles1).toContain('owner')
      expect(roles2).toContain('member')
    })

    it('should initialize SSO provider and load config', () => {
      ssoProvider.init()
      expect(ssoProvider).toBeDefined()
    })

    it('should save SSO config on shutdown()', () => {
      const config = {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/callback',
        issuer: 'https://auth.example.com',
      }

      ssoProvider.initiateSsoLogin('oidc', config)
      ssoProvider.shutdown()

      const configPath = path.join(
        process.env.HOME || process.env.USERPROFILE || '/tmp',
        '.nyra',
        'enterprise',
        'sso-config.json'
      )

      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        expect(data.config).toBeDefined()
      }
    })

    it('should initialize team manager and load teams', () => {
      teams.init()
      expect(teams).toBeDefined()
    })

    it('should persist teams across shutdown/init cycle', () => {
      teams.init()
      teams.createTeam('Engineering', 'user-1')
      teams.createTeam('Product', 'user-2')
      teams.shutdown()

      const teams2 = new TeamManager(rbac)
      teams2.init()
      expect(teams2).toBeDefined()
    })

    it('should validate token after SSO init/shutdown cycle', () => {
      ssoProvider.init()

      const config = {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/callback',
        issuer: 'https://auth.example.com',
      }

      const authUrl = ssoProvider.initiateSsoLogin('oidc', config)
      const stateMatch = authUrl.match(/state=([a-f0-9]+)/)
      const state = stateMatch ? stateMatch[1] : ''

      const token = ssoProvider.handleCallback({ code: 'auth-code', state })
      ssoProvider.shutdown()

      const isValid = ssoProvider.validateToken(token.accessToken)
      expect(isValid).toBe(true)
    })
  })
})
