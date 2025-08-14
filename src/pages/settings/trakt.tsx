import SettingsLayout from '@app/components/Settings/SettingsLayout';
import SettingsTrakt from '@app/components/Settings/SettingsTrakt';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const TraktSettingsPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  const router = useRouter();

  // Handle trakt success/error messages from URL parameters
  useEffect(() => {
    const { trakt } = router.query;
    if (trakt === 'success') {
      // Success message would be handled by the component
      router.replace('/settings/trakt', undefined, { shallow: true });
    } else if (trakt === 'error') {
      // Error message would be handled by the component
      router.replace('/settings/trakt', undefined, { shallow: true });
    }
  }, [router]);

  return (
    <SettingsLayout>
      <SettingsTrakt
        onClose={() => {
          // No-op for page-based component
        }}
        onSave={() => {
          // No-op for page-based component
        }}
      />
    </SettingsLayout>
  );
};

export default TraktSettingsPage;
