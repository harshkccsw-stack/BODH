import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Full-screen centred error state (used for load failures in the take flow).
export function ErrorCard({
  message,
  actionLabel = 'Back to Assessments',
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 space-y-4 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <p className="text-sm">{message}</p>
          {onAction && (
            <Button variant="outline" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
