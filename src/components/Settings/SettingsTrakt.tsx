import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import globalMessages from '@app/i18n/globalMessages';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useEffect, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR, { mutate } from 'swr';
import * as Yup from 'yup';

const messages = defineMessages({
  trakt: 'Trakt',
  traktSettings: 'Trakt Settings',
  traktSettingsDescription:
    'Configure your Trakt.tv integration to sync watch history and watchlist.',
  clientId: 'Client ID',
  clientSecret: 'Client Secret',
  connectedAs: 'Connected as {username}',
  notConnected: 'Not Connected',
  connect: 'Connect Trakt',
  disconnect: 'Disconnect',
  disconnecting: 'Disconnecting...',
  testing: 'Testing...',
  testConnection: 'Test Connection',
  connectionSuccess: 'Connection successful!',
  connectionFailed: 'Connection failed',
  disconnectSuccess: 'Successfully disconnected from Trakt',
  syncWatchlist: 'Sync Watchlist',
  syncWatchlistDescription:
    'Automatically sync your Trakt watchlist with your requested media in Overseerr',
  validationClientId: 'Client ID is required',
  validationClientSecret: 'Client Secret is required',
  toastSettingsSuccess: 'Trakt settings saved successfully!',
  toastSettingsFailure: 'Failed to save Trakt settings',
  toastConnectSuccess: 'Successfully connected to Trakt!',
  toastConnectFailure: 'Failed to connect to Trakt',
  toastTestSuccess: 'Trakt connection test succeeded!',
  toastTestFailure: 'Trakt connection test failed',
});

interface TraktModalProps {
  onClose: () => void;
  onSave: () => void;
}

const SettingsTrakt = ({ onClose, onSave }: TraktModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'disconnected' | 'unknown'
  >('unknown');

  const { data: mainSettings } = useSWR('/api/v1/settings/main');

  const SettingsSchema = Yup.object().shape({
    clientId: Yup.string()
      .required(intl.formatMessage(messages.validationClientId))
      .min(32, 'Client ID must be at least 32 characters'),
    clientSecret: Yup.string()
      .required(intl.formatMessage(messages.validationClientSecret))
      .min(32, 'Client Secret must be at least 32 characters'),
    syncWatchlist: Yup.boolean().required(),
  });

  useEffect(() => {
    if (mainSettings?.trakt) {
      checkConnectionStatus();
    }
  }, [mainSettings]);

  const checkConnectionStatus = async () => {
    try {
      const response = await axios.get('/api/v1/trakt/me');
      setConnectionStatus(
        response.data.connected ? 'connected' : 'disconnected'
      );
      return response.data;
    } catch (error) {
      setConnectionStatus('disconnected');
      return null;
    }
  };

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const response = await axios.get('/api/v1/trakt/auth-url');
      window.location.href = response.data.authUrl;
    } catch (error) {
      addToast(intl.formatMessage(messages.toastConnectFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setIsDisconnecting(true);
      await axios.post('/api/v1/trakt/disconnect');
      setConnectionStatus('disconnected');
      addToast(intl.formatMessage(messages.disconnectSuccess), {
        autoDismiss: true,
        appearance: 'success',
      });
      mutate('/api/v1/settings/main');
      onSave();
    } catch (error) {
      addToast('Failed to disconnect from Trakt', {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      await axios.post('/api/v1/trakt/test-connection');
      addToast(intl.formatMessage(messages.toastTestSuccess), {
        autoDismiss: true,
        appearance: 'success',
      });
      setConnectionStatus('connected');
    } catch (error) {
      addToast(intl.formatMessage(messages.toastTestFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
      setConnectionStatus('disconnected');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveSettings = async (values: {
    clientId: string;
    clientSecret: string;
    syncWatchlist: boolean;
  }) => {
    try {
      await axios.post('/api/v1/trakt/settings', values);
      addToast(intl.formatMessage(messages.toastSettingsSuccess), {
        autoDismiss: true,
        appearance: 'success',
      });
      mutate('/api/v1/settings/main');
      onSave();
    } catch (error) {
      addToast(intl.formatMessage(messages.toastSettingsFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    }
  };

  const initialFormValues = {
    clientId: mainSettings?.trakt?.clientId || '',
    clientSecret: mainSettings?.trakt?.clientSecret || '',
    syncWatchlist: mainSettings?.trakt?.syncWatchlist || false,
  };

  return (
    <Formik
      initialValues={initialFormValues}
      validationSchema={SettingsSchema}
      onSubmit={(values) => handleSaveSettings(values)}
      enableReinitialize={true}
    >
      {({
        errors,
        touched,
        isSubmitting,
        setFieldValue,
        setFieldTouched,
        values,
      }) => (
        <div className="mb-10 rounded-lg bg-gray-800 p-6 shadow-md">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="mb-2 text-xl font-bold text-white">
                {intl.formatMessage(messages.traktSettings)}
              </h3>
              <p className="text-sm text-gray-400">
                {intl.formatMessage(messages.traktSettingsDescription)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-2 text-gray-400 transition hover:bg-gray-700 hover:text-white"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {connectionStatus === 'unknown' ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              <Alert
                type={connectionStatus === 'connected' ? 'warning' : 'info'}
              >
                {connectionStatus === 'connected' ? (
                  <span>
                    {intl.formatMessage(messages.connectedAs, {
                      username: mainSettings?.trakt?.username || 'User',
                    })}
                  </span>
                ) : (
                  <span>{intl.formatMessage(messages.notConnected)}</span>
                )}
              </Alert>

              <Form>
                <div className="mt-6 space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <label
                        htmlFor="clientId"
                        className="mb-2 block text-sm font-medium text-gray-300"
                      >
                        {intl.formatMessage(messages.clientId)}
                      </label>
                      <Field
                        as={SensitiveInput}
                        id="clientId"
                        name="clientId"
                        type="text"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setFieldValue('clientId', e.target.value);
                          setFieldTouched('clientId', true, false);
                        }}
                        placeholder="Enter your Trakt Client ID"
                      />
                      {errors.clientId && touched.clientId && (
                        <p className="mt-1 text-sm text-red-500">
                          {String(errors.clientId)}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="clientSecret"
                        className="mb-2 block text-sm font-medium text-gray-300"
                      >
                        {intl.formatMessage(messages.clientSecret)}
                      </label>
                      <Field
                        as={SensitiveInput}
                        id="clientSecret"
                        name="clientSecret"
                        type="text"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setFieldValue('clientSecret', e.target.value);
                          setFieldTouched('clientSecret', true, false);
                        }}
                        placeholder="Enter your Trakt Client Secret"
                      />
                      {errors.clientSecret && touched.clientSecret && (
                        <p className="mt-1 text-sm text-red-500">
                          {String(errors.clientSecret)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-start">
                      <div className="flex h-5 items-center">
                        <Field
                          id="syncWatchlist"
                          name="syncWatchlist"
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-800"
                        />
                      </div>
                      <div className="ml-3">
                        <label
                          htmlFor="syncWatchlist"
                          className="block text-sm font-medium text-gray-300"
                        >
                          {intl.formatMessage(messages.syncWatchlist)}
                        </label>
                        <p className="text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.syncWatchlistDescription
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 border-t border-gray-700 pt-6">
                    {connectionStatus === 'connected' ? (
                      <>
                        <Button
                          buttonType="ghost"
                          onClick={handleDisconnect}
                          disabled={isDisconnecting}
                        >
                          {isDisconnecting ? (
                            <>
                              <LoadingSpinner />
                              <span className="ml-2">
                                {intl.formatMessage(messages.disconnecting)}
                              </span>
                            </>
                          ) : (
                            <span>
                              {intl.formatMessage(messages.disconnect)}
                            </span>
                          )}
                        </Button>
                        <Button
                          buttonType="ghost"
                          onClick={handleTestConnection}
                          disabled={isTesting}
                        >
                          {isTesting ? (
                            <>
                              <LoadingSpinner />
                              <span className="ml-2">
                                {intl.formatMessage(messages.testing)}
                              </span>
                            </>
                          ) : (
                            <>
                              <ArrowPathIcon className="mr-2 h-5 w-5" />
                              {intl.formatMessage(messages.testConnection)}
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      <Button
                        buttonType="ghost"
                        onClick={handleConnect}
                        disabled={
                          isConnecting ||
                          !values.clientId ||
                          !values.clientSecret
                        }
                      >
                        {isConnecting ? (
                          <>
                            <LoadingSpinner />
                            <span className="ml-2">Connecting...</span>
                          </>
                        ) : (
                          intl.formatMessage(messages.connect)
                        )}
                      </Button>
                    )}

                    <div className="flex-1" />

                    <Button
                      type="submit"
                      buttonType="primary"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <LoadingSpinner />
                          <span className="ml-2">Saving...</span>
                        </>
                      ) : (
                        <>{intl.formatMessage(globalMessages.save)}</>
                      )}
                    </Button>
                  </div>
                </div>
              </Form>
            </>
          )}
        </div>
      )}
    </Formik>
  );
};

export default SettingsTrakt;
