import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useAuth } from '@/context/authContext'
import { AlertCircle, Loader2, Upload, User } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'

const Login = () => {
	const { login, isLoading, isAuthenticated, error } = useAuth()

	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')

	const appName = import.meta.env.VITE_APP_NAME

	if (isAuthenticated) {
		return <Navigate to='/' replace={true} />
	}

	const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()

		await login(username, password)
	}

	return (
		<div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4'>
			<div className='w-full max-w-md space-y-8'>
				{/* Header */}
				<div className='text-center space-y-4'>
					<div className='flex justify-center'>
						<div className='bg-primary rounded-full p-4'>
							<Upload className='h-8 w-8 text-primary-foreground' />
						</div>
					</div>

					<div className='space-y-2'>
						<h1 className='text-3xl font-bold tracking-tight text-gray-900 dark:text-white'>
							{appName}
						</h1>

						<h2 className='text-xl font-semibold text-gray-700 dark:text-gray-300'>
							OCLC WorldCat Metadata API Bulk Processing Application
						</h2>

						<p className='text-sm text-gray-600 dark:text-gray-400'>
							Sign in to access your library data management tools
						</p>
					</div>
				</div>

				{/* Login Card */}
				<Card className='shadow-lg border-0 backdrop-blur-sm'>
					<CardHeader className='text-center pb-4'>
						<h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
							Welcome Back
						</h3>

						<p className='text-sm text-gray-600 dark:text-gray-400'>
							Sign in to continue
						</p>
					</CardHeader>

					<CardContent className='space-y-6'>
						{/* Error Message */}
						{error && (
							<div className='flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md'>
								<AlertCircle className='h-4 w-4 text-red-500' />

								<p className='text-sm text-red-700 dark:text-red-400'>
									{error}
								</p>
							</div>
						)}

						<form onSubmit={handleLogin} className='space-y-6'>
							{/* Username */}
							<div className='space-y-2'>
								<label
									htmlFor='username'
									className='text-sm font-medium text-gray-700 dark:text-gray-300'
								>
									Username
								</label>

								<input
									id='username'
									name='username'
									type='text'
									autoComplete='username'
									value={username}
									onChange={(event) => setUsername(event.target.value)}
									disabled={isLoading}
									required
									className='w-full h-12 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:disabled:bg-gray-800'
								/>
							</div>

							{/* Password */}
							<div className='space-y-2'>
								<label
									htmlFor='password'
									className='text-sm font-medium text-gray-700 dark:text-gray-300'
								>
									Password
								</label>

								<input
									id='password'
									name='password'
									type='password'
									autoComplete='current-password'
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									disabled={isLoading}
									required
									className='w-full h-12 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:disabled:bg-gray-800'
								/>
							</div>

							{/* Login Button */}
							<Button
								type='submit'
								disabled={
									isLoading ||
									username.trim().length === 0 ||
									password.length === 0
								}
								className='w-full h-12 bg-primary hover:bg-primary/90 disabled:bg-gray-400 text-white font-medium transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:transform-none'
								size='lg'
							>
								{isLoading ? (
									<>
										<Loader2 className='mr-3 h-5 w-5 animate-spin' />
										Signing in...
									</>
								) : (
									<>
										<User className='mr-3 h-5 w-5' />
										Sign in
									</>
								)}
							</Button>
						</form>
					</CardContent>
				</Card>

				{/* Footer */}
				<div className='text-center'>
					<p className='text-xs text-gray-500 dark:text-gray-400'>
						Need help? Contact your system administrator
					</p>
				</div>
			</div>
		</div>
	)
}

export default Login