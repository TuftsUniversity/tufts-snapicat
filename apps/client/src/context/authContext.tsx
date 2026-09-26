import { db } from '@/lib/database'
import type { User } from '@/types'
import type React from 'react'
import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from 'react'

interface AuthContextType {
	isAuthenticated: boolean
	user: User | null
	accessToken: string | null
	login: (username: string, password: string) => Promise<void>
	logout: () => Promise<void>
	isLoading: boolean
	error: string | null
	getValidAccessToken: (minValidityMs?: number) => Promise<string | null>
}

interface AuthResponse {
	authenticated: boolean
	user: User
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
	children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
	const [user, setUser] = useState<User | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const isAuthenticated = user !== null

	/**
	 * Check the current FastAPI session when the application starts.
	 */
	const checkAuthentication = useCallback(async () => {
		try {
			const response = await fetch('/api/me', {
				method: 'GET',
				credentials: 'include',
			})

			if (!response.ok) {
				setUser(null)
				return
			}

			const data: AuthResponse = await response.json()

			if (data.authenticated && data.user) {
				setUser(data.user)
			} else {
				setUser(null)
			}
		} catch (_err) {
			setUser(null)
		}
	}, [])

	/**
	 * Authenticate against the local FastAPI server.
	 */
	const login = useCallback(
		async (username: string, password: string) => {
			setIsLoading(true)
			setError(null)

			try {
				const response = await fetch('/api/login', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					credentials: 'include',
					body: JSON.stringify({
						username,
						password,
					}),
				})

				let data: AuthResponse | { detail?: string }

				try {
					data = await response.json()
				} catch {
					data = {}
				}

				if (!response.ok) {
					const errorMessage =
						'detail' in data && data.detail
							? data.detail
							: 'Login failed. Please check your username and password.'

					setUser(null)
					setError(errorMessage)
					return
				}

				if ('authenticated' in data && data.authenticated && data.user) {
					setUser(data.user)
					setError(null)

					window.location.hash = '/'
				} else {
					setUser(null)
					setError('Login failed. The server did not return a valid session.')
				}
			} catch (_err) {
				setUser(null)
				setError(
					'Unable to connect to the authentication server. Please try again.',
				)
			} finally {
				setIsLoading(false)
			}
		},
		[],
	)

	/**
	 * Log out of the local FastAPI session.
	 */
	const logout = useCallback(async () => {
		setIsLoading(true)
		setError(null)

		try {
			await fetch('/api/logout', {
				method: 'POST',
				credentials: 'include',
			})

			setUser(null)

			// Clear all selection and query state from IndexedDB on logout.
			await db.checked_rows.clear()
			await db.unchecked_rows.clear()
			await db.recent_queried_successful_rows.clear()

			// Preserve column orders and theme before clearing localStorage.
			const currentTheme = localStorage.getItem('bookops-ui-theme')
			const advColumnOrder = localStorage.getItem(
				'adv_unprocessed_columnOrder',
			)
			const processedColumnOrder = localStorage.getItem(
				'processed_columnOrder',
			)

			localStorage.clear()

			// Restore preserved values.
			if (currentTheme) {
				localStorage.setItem('bookops-ui-theme', currentTheme)
			}

			if (advColumnOrder) {
				localStorage.setItem(
					'adv_unprocessed_columnOrder',
					advColumnOrder,
				)
			}

			if (processedColumnOrder) {
				localStorage.setItem(
					'processed_columnOrder',
					processedColumnOrder,
				)
			}

			window.location.hash = '#/login'
			window.location.reload()
		} catch (_err) {
			setError('Logout failed. Please try again.')
		} finally {
			setIsLoading(false)
		}
	}, [])

	/**
	 * Snapicat previously used this method to obtain an Azure access token.
	 *
	 * Local FastAPI authentication uses an HttpOnly session cookie instead,
	 * so there is no access token to return.
	 *
	 * The method remains in the context interface so existing components that
	 * call useAuth().getValidAccessToken() do not immediately break.
	 */
	const getValidAccessToken = useCallback(
		async (_minValidityMs: number = 10 * 60 * 1000) => {
			return null
		},
		[],
	)

	/**
	 * Initialize authentication state when the application starts.
	 */
	useEffect(() => {
		const initializeAuthentication = async () => {
			setIsLoading(true)

			try {
				await checkAuthentication()
			} catch (_err) {
				setUser(null)
			} finally {
				setIsLoading(false)
			}
		}

		initializeAuthentication()
	}, [checkAuthentication])

	const contextValue: AuthContextType = {
		isAuthenticated,
		user,
		accessToken: null,
		login,
		logout,
		isLoading,
		error,
		getValidAccessToken,
	}

	return (
		<AuthContext.Provider value={contextValue}>
			{children}
		</AuthContext.Provider>
	)
}

export const useAuth = (): AuthContextType => {
	const context = useContext(AuthContext)

	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider')
	}

	return context
}