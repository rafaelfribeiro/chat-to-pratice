import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginForm from '../../components/LoginForm'

// ── Mock fetch ────────────────────────────────────────────────
const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
})

describe('LoginForm', () => {
  it('deve renderizar campos de email e senha', () => {
    render(<LoginForm />)
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/senha/i)).toBeInTheDocument()
  })

  it('deve renderizar botão de login', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('deve renderizar botão de login com Google', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
  })

  it('deve mostrar erro quando campos estiverem vazios', async () => {
    render(<LoginForm />)
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }))
    expect(screen.getByText(/preencha todos os campos/i)).toBeInTheDocument()
  })

  it('deve chamar API com email e senha corretos', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'user-1', name: 'João' })
    })

    render(<LoginForm />)
    await userEvent.type(screen.getByPlaceholderText(/email/i), 'joao@email.com')
    await userEvent.type(screen.getByPlaceholderText(/senha/i), '123456')
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'joao@email.com', password: '123456' })
      }))
    })
  })

  it('deve mostrar erro quando credenciais forem inválidas', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Credenciais inválidas' })
    })

    render(<LoginForm />)
    await userEvent.type(screen.getByPlaceholderText(/email/i), 'joao@email.com')
    await userEvent.type(screen.getByPlaceholderText(/senha/i), 'errada')
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByText(/credenciais inválidas/i)).toBeInTheDocument()
    })
  })

  it('deve mostrar erro quando conta estiver bloqueada (429)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Conta bloqueada. Tente novamente em 1 hora.' })
    })

    render(<LoginForm />)
    await userEvent.type(screen.getByPlaceholderText(/email/i), 'joao@email.com')
    await userEvent.type(screen.getByPlaceholderText(/senha/i), 'errada')
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByText(/conta bloqueada/i)).toBeInTheDocument()
    })
  })
})
