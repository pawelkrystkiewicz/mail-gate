import type { EmailProvider } from './provider'

export class ProviderRegistry {
  private providers = new Map<string, EmailProvider>()

  register(provider: EmailProvider): void {
    this.providers.set(provider.name, provider)
  }

  get(name: string): EmailProvider {
    const provider = this.providers.get(name)
    if (!provider) {
      throw new Error(`Provider "${name}" not registered`)
    }
    return provider
  }

  has(name: string): boolean {
    return this.providers.has(name)
  }

  list(): string[] {
    return [...this.providers.keys()]
  }
}

export const registry = new ProviderRegistry()
