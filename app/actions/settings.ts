'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'

type Settings = {
  githubConfigured: boolean
  gitlabConfigured: boolean
  notifications: boolean
  scanFrequency: 'hourly' | 'daily' | 'weekly'
}

type StoredSettings = Partial<Settings> & {
  githubToken?: string
  gitlabToken?: string
}

const defaultSettings: Settings = {
  githubConfigured: false,
  gitlabConfigured: false,
  notifications: true,
  scanFrequency: 'daily',
}

async function getAuthenticatedUser() {
  const { userId } = await auth()
  if (!userId) throw new Error('You must be signed in to manage settings.')
  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  return { client, user }
}

export async function loadSettings(): Promise<Settings> {
  const { user } = await getAuthenticatedUser()
  const stored = (user.privateMetadata.appSettings ?? {}) as StoredSettings
  return {
    githubConfigured: Boolean(stored.githubToken),
    gitlabConfigured: Boolean(stored.gitlabToken),
    notifications: stored.notifications ?? defaultSettings.notifications,
    scanFrequency: stored.scanFrequency ?? defaultSettings.scanFrequency,
  }
}

async function validateProviderToken(provider: 'github' | 'gitlab', token: string) {
  const endpoint = provider === 'github' ? 'https://api.github.com/user' : 'https://gitlab.com/api/v4/user'
  const headers: Record<string, string> = provider === 'github'
    ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'sekiato-app' }
    : { 'PRIVATE-TOKEN': token }
  const response = await fetch(endpoint, { headers })
  if (!response.ok) {
    throw new Error(`${provider === 'github' ? 'GitHub' : 'GitLab'} rejected that token (HTTP ${response.status}).`)
  }
}

export async function saveSettings(input: {
  githubToken: string
  gitlabToken: string
  notifications: boolean
  scanFrequency: string
}) {
  const { client, user } = await getAuthenticatedUser()
  if (!['hourly', 'daily', 'weekly'].includes(input.scanFrequency)) {
    throw new Error('Choose a valid scan frequency.')
  }

  const current = (user.privateMetadata.appSettings ?? {}) as StoredSettings
  const githubToken = input.githubToken.trim() || current.githubToken || ''
  const gitlabToken = input.gitlabToken.trim() || current.gitlabToken || ''

  if (input.githubToken.trim()) await validateProviderToken('github', input.githubToken.trim())
  if (input.gitlabToken.trim()) await validateProviderToken('gitlab', input.gitlabToken.trim())

  const appSettings: StoredSettings = {
    githubToken,
    gitlabToken,
    notifications: input.notifications,
    scanFrequency: input.scanFrequency as Settings['scanFrequency'],
  }
  await client.users.updateUserMetadata(user.id, {
    privateMetadata: { appSettings },
  })

  return {
    githubConfigured: Boolean(githubToken),
    gitlabConfigured: Boolean(gitlabToken),
    notifications: appSettings.notifications,
    scanFrequency: appSettings.scanFrequency,
  }
}

export async function removeProviderToken(provider: 'github' | 'gitlab') {
  const { client, user } = await getAuthenticatedUser()
  const current = (user.privateMetadata.appSettings ?? {}) as StoredSettings
  const appSettings: StoredSettings = {
    ...current,
    githubToken: provider === 'github' ? '' : current.githubToken,
    gitlabToken: provider === 'gitlab' ? '' : current.gitlabToken,
  }
  await client.users.updateUserMetadata(user.id, {
    privateMetadata: { appSettings },
  })
  return loadSettings()
}
