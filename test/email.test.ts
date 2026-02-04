import { describe, expect, test } from 'bun:test'
import { parseEmailAddress } from '../src/utils/email'

describe('parseEmailAddress', () => {
  test('parses plain email address', () => {
    const result = parseEmailAddress('user@example.com')

    expect(result.email).toBe('user@example.com')
    expect(result.name).toBeUndefined()
  })

  test('parses email with display name', () => {
    const result = parseEmailAddress('John Doe <john@example.com>')

    expect(result.email).toBe('john@example.com')
    expect(result.name).toBe('John Doe')
  })

  test('parses email with quoted display name', () => {
    const result = parseEmailAddress('"John Doe" <john@example.com>')

    expect(result.email).toBe('john@example.com')
    expect(result.name).toBe('"John Doe"')
  })

  test('handles extra whitespace around address', () => {
    const result = parseEmailAddress('  John Doe   <john@example.com>  ')

    expect(result.email).toBe('john@example.com')
    expect(result.name).toBe('John Doe')
  })

  test('handles email with no space before angle bracket', () => {
    const result = parseEmailAddress('Support<support@example.com>')

    expect(result.email).toBe('support@example.com')
    expect(result.name).toBe('Support')
  })

  test('handles plain email with whitespace', () => {
    const result = parseEmailAddress('  user@example.com  ')

    expect(result.email).toBe('user@example.com')
    expect(result.name).toBeUndefined()
  })

  test('handles complex display names', () => {
    const result = parseEmailAddress(
      'Dr. John Smith Jr. <john.smith@example.com>',
    )

    expect(result.email).toBe('john.smith@example.com')
    expect(result.name).toBe('Dr. John Smith Jr.')
  })

  test('handles email with special characters in local part', () => {
    const result = parseEmailAddress('Test <test+tag@example.com>')

    expect(result.email).toBe('test+tag@example.com')
    expect(result.name).toBe('Test')
  })
})
