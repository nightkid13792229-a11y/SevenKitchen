/**
 * Request User Interface
 * Represents the authenticated user in the request context
 */

export interface RequestUser {
  userId: string;
  customerId: string; // Backward compatibility
  role: string;
}
