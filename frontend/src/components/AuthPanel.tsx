import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import type { AuthMode } from '../types'

type LoginValues = {
  identifier: string
  password: string
}

type SignupValues = {
  username: string
  email: string
  password: string
  confirmPassword: string
}

type AuthPanelProps = {
  mode: AuthMode
  notice?: string
  onModeChange: (mode: AuthMode) => void
  onLogin: (values: LoginValues) => Promise<void>
  onSignup: (values: SignupValues) => Promise<void>
}

export function AuthPanel({
  mode,
  notice = '',
  onModeChange,
  onLogin,
  onSignup,
}: AuthPanelProps) {
  const [loginValues, setLoginValues] = useState<LoginValues>({
    identifier: '',
    password: '',
  })
  const [signupValues, setSignupValues] = useState<SignupValues>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setError('')
  }, [mode, notice])

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setError('')
    setIsSubmitting(true)
    try {
      await onLogin(loginValues)
      setLoginValues({ identifier: '', password: '' })
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to log in right now.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    if (signupValues.password !== signupValues.confirmPassword) {
      setError('Password confirmation does not match.')
      return
    }

    setError('')
    setIsSubmitting(true)
    try {
      await onSignup(signupValues)
      setSignupValues({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
      })
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to create your account right now.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <aside className="auth-card">
      <div className="auth-card-header">
        <p className="kicker">Session Access</p>
        <h2>{mode === 'login' ? 'Log in to continue' : 'Create your account'}</h2>
        <p className="auth-copy">
          {mode === 'login'
            ? 'Use your username or email to unlock stock analysis.'
            : 'Create a secure account to access the analysis workspace.'}
        </p>
      </div>

      <div className="auth-tabs" role="tablist" aria-label="Authentication options">
        <button
          type="button"
          className={mode === 'login' ? 'active' : ''}
          onClick={() => onModeChange('login')}
        >
          Log In
        </button>
        <button
          type="button"
          className={mode === 'signup' ? 'active' : ''}
          onClick={() => onModeChange('signup')}
        >
          Create Account
        </button>
      </div>

      {notice && <p className="auth-notice">{notice}</p>}
      {error && <p className="auth-error">{error}</p>}

      {mode === 'login' ? (
        <form className="auth-form" onSubmit={handleLoginSubmit}>
          <label className="auth-field">
            <span>Username or email</span>
            <input
              value={loginValues.identifier}
              onChange={(event) =>
                setLoginValues((current) => ({
                  ...current,
                  identifier: event.target.value,
                }))
              }
              autoComplete="username"
              placeholder="jane_doe or jane@example.com"
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={loginValues.password}
              onChange={(event) =>
                setLoginValues((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </label>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Logging In...' : 'Log In'}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={handleSignupSubmit}>
          <label className="auth-field">
            <span>Username</span>
            <input
              value={signupValues.username}
              onChange={(event) =>
                setSignupValues((current) => ({
                  ...current,
                  username: event.target.value,
                }))
              }
              autoComplete="username"
              placeholder="Choose a username"
            />
          </label>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              value={signupValues.email}
              onChange={(event) =>
                setSignupValues((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              autoComplete="email"
              placeholder="name@example.com"
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={signupValues.password}
              onChange={(event) =>
                setSignupValues((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              autoComplete="new-password"
              placeholder="Create a password"
            />
          </label>
          <label className="auth-field">
            <span>Confirm password</span>
            <input
              type="password"
              value={signupValues.confirmPassword}
              onChange={(event) =>
                setSignupValues((current) => ({
                  ...current,
                  confirmPassword: event.target.value,
                }))
              }
              autoComplete="new-password"
              placeholder="Repeat your password"
            />
          </label>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
      )}
    </aside>
  )
}
