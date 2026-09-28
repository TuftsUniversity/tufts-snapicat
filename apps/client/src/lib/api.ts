import { useToast } from '@/hooks/use-toast'
import axios from 'axios'
import React from 'react'

export interface SearchRequest {
	appendSearchQuery: string
	sortingOrder: string
	books: {
		rowId: number
		[key: string]: any
	}[]
	isRefining?: boolean
}

export interface SearchResponse {
	success: boolean
	books: {
		rowId: number
		[key: string]: any
	}[]
	total_processed?: number
	api_usage_remaining?: number
	// Optional flag used to indicate user-initiated cancellation
	cancelled?: boolean
}

const createApiInstance = () => {
	return axios.create({
		baseURL: import.meta.env.VITE_API_BASE_URL,
		timeout: 2700000, // 45 minutes
		withCredentials: true,
	})
}

const debounce = (func: Function, wait: number) => {
	let timeout: ReturnType<typeof setTimeout>

	return (...args: any[]) => {
		clearTimeout(timeout)
		timeout = setTimeout(() => func(...args), wait)
	}
}

export const useApi = () => {
	const { toast } = useToast()

	const showErrorToast = React.useMemo(
		() =>
			debounce((title: string, description: string) => {
				toast({
					title,
					description,
					variant: 'destructive',
				})
			}, 1000),
		[toast],
	)

	const api = React.useMemo(() => {
		const instance = createApiInstance()

		instance.interceptors.response.use(
			(response) => response,
			async (error) => {
				if (error.code === 'ECONNABORTED') {
					showErrorToast(
						'Request Timeout',
						'The request took too long to complete.',
					)

					return Promise.reject(error)
				}

				if (error.code === 'ERR_NETWORK') {
					showErrorToast(
						'Network Error',
						'Please check your internet connection.',
					)

					return Promise.reject(error)
				}

				if (error.response) {
					const { status, data } = error.response

					console.error('API request failed:', {
						method: error.config?.method,
						url: error.config?.url,
						status,
						data,
					})

					switch (status) {
						case 400:
							showErrorToast(
								'Error',
								data?.detail ||
									data?.error ||
									'Invalid request',
							)
							break

						case 401:
							/*
							 * IMPORTANT:
							 *
							 * Do NOT automatically call logout() here.
							 *
							 * A 401 can originate from an upstream service
							 * such as OCLC. It does not necessarily mean that
							 * the user's Snapicat session has expired.
							 *
							 * Local application authentication is verified
							 * separately by /api/me in AuthProvider.
							 */
							showErrorToast(
								'Unauthorized',
								data?.detail ||
									data?.error ||
									'The API request was not authorized.',
							)
							break

						case 403:
							showErrorToast(
								'Access Denied',
								data?.detail ||
									data?.error ||
									'You do not have permission to perform this action.',
							)
							break

						case 404:
							showErrorToast(
								'Not Found',
								data?.detail ||
									data?.error ||
									'The requested resource was not found.',
							)
							break

						case 500:
							showErrorToast(
								'Server Error',
								data?.detail ||
									data?.error ||
									'Internal server error occurred.',
							)
							break

						default:
							showErrorToast(
								'Error',
								data?.detail ||
									data?.error ||
									'Something went wrong!',
							)
					}
				}

				return Promise.reject(error)
			},
		)

		return instance
	}, [showErrorToast])

	return api
}

const defaultApi = createApiInstance()

export { defaultApi as api }