"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { loadSettings, removeProviderToken, saveSettings } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

const settingsSchema = z.object({
  githubToken: z.string(),
  gitlabToken: z.string(),
  notifications: z.boolean(),
  scanFrequency: z.string(),
});

export function SettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<"github" | "gitlab" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState({ github: false, gitlab: false });

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      githubToken: "",
      gitlabToken: "",
      notifications: true,
      scanFrequency: "daily",
    },
  });

  useEffect(() => {
    loadSettings()
      .then((settings) => {
        setConfigured({ github: settings.githubConfigured, gitlab: settings.gitlabConfigured });
        form.reset({
          githubToken: "",
          gitlabToken: "",
          notifications: settings.notifications,
          scanFrequency: settings.scanFrequency,
        });
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load settings."))
      .finally(() => setLoading(false));
  }, [form]);

  async function onSubmit(values: z.infer<typeof settingsSchema>) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveSettings(values);
      setConfigured({ github: saved.githubConfigured, gitlab: saved.gitlabConfigured });
      form.setValue("githubToken", "");
      form.setValue("gitlabToken", "");
      setMessage("Settings saved successfully.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveToken(provider: "github" | "gitlab") {
    setRemoving(provider);
    setError("");
    setMessage("");
    try {
      const updated = await removeProviderToken(provider);
      setConfigured({ github: updated.githubConfigured, gitlab: updated.gitlabConfigured });
      setMessage(`${provider === "github" ? "GitHub" : "GitLab"} token removed.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove token.");
    } finally {
      setRemoving(null);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Git Provider Integration</CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="githubToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GitHub Token</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={configured.github ? "Token saved; enter a new token to replace it" : "GitHub personal access token"}
                        {...field}
                        value={field.value ?? ""}
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <FormDescription>
                      {configured.github ? "Connected. The saved token is never shown here." : "Required for private repositories. Public repositories work without a token."}
                    </FormDescription>
                    <FormMessage />
                    {configured.github && <Button type="button" variant="outline" size="sm" disabled={removing !== null} onClick={() => handleRemoveToken("github")}>{removing === "github" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Remove GitHub token</Button>}
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gitlabToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GitLab Token</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={configured.gitlab ? "Token saved; enter a new token to replace it" : "GitLab personal access token"}
                        {...field}
                        value={field.value ?? ""}
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <FormDescription>
                      {configured.gitlab ? "Connected. The saved token is never shown here." : "Token storage and validation are available; repository importing currently supports GitHub."}
                    </FormDescription>
                    <FormMessage />
                    {configured.gitlab && <Button type="button" variant="outline" size="sm" disabled={removing !== null} onClick={() => handleRemoveToken("gitlab")}>{removing === "gitlab" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Remove GitLab token</Button>}
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="notifications"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Email Notifications
                      </FormLabel>
                      <FormDescription>
                        Receive notifications about new vulnerabilities
                      </FormDescription>
                    </div>

                    <FormControl>
                      <Switch
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="scanFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scan Frequency</FormLabel>

                    <Select
                      value={field.value ?? "daily"}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                      </FormControl>

                      <SelectContent>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                      </SelectContent>
                    </Select>

                    <FormDescription>
                      How often to scan your repositories
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit">Save Preferences</Button>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving || removing !== null}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}