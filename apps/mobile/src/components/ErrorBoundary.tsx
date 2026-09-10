/**
 * Top-level React Error Boundary.
 *
 * Prevents uncaught render or effect-unmount errors from tearing down the
 * entire React component tree to a blank white screen ("จอขาว").
 *
 * Automatically resets when the route/screen key changes, so navigating
 * to another tab recovers gracefully.
 */

import React from 'react';
import { View } from 'react-native';
import { color, gutter, radius } from '../theme/index.ts';
import { Body, Heading } from './Type.tsx';
import { Button } from './Button.tsx';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ChivaGo ErrorBoundary caught error]:', error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error ?? new Error('Unknown error'), this.reset);
      }
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: color.bg,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: gutter,
            paddingVertical: 32,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 400,
              padding: 24,
              backgroundColor: color.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: color.neutral300,
              alignItems: 'center',
            }}
          >
            <Heading size={18} colour={color.brand}>
              Something went wrong
            </Heading>
            <Body
              size={13}
              colour={color.neutral600}
              style={{ marginTop: 8, textAlign: 'center', lineHeight: 18 }}
            >
              The screen ran into a problem, but your progress is safe.
            </Body>
            <Button
              label="Reload screen"
              onPress={this.reset}
              variant="primary"
              height={44}
              style={{ marginTop: 20, width: '100%' }}
            />
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}
