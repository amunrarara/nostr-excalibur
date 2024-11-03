import { useState } from 'react';
import { PlusCircle, MinusCircle, Sword } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Scroll } from 'lucide-react';
import { Relay } from 'nostr-tools/relay';
import { SimplePool } from 'nostr-tools/pool';
import { nip19, getPublicKey, finalizeEvent } from 'nostr-tools';
import type { Event } from 'nostr-tools';

interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

const App = () => {
  const [npub, setNpub] = useState('');
  const [relays, setRelays] = useState(['wss://relay.damus.io']);
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nsec, setNsec] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  const addRelayInput = () => {
    setRelays([...relays, '']);
  };

  const removeRelayInput = (index: number) => {
    const newRelays = relays.filter((_, i) => i !== index);
    setRelays(newRelays);
  };

  const updateRelay = (index: number, value: string) => {
    const newRelays = [...relays];
    newRelays[index] = value;
    setRelays(newRelays);
  };

  const handleDrawSword = () => {
    setIsModalOpen(true);
  };

  const handleCloneEvents = async () => {
    setIsLoading(true);
    setError(null);

    const pool = new SimplePool();

    try {
      if (!npub.startsWith('npub1')) {
        throw new Error('Invalid npub format. Must start with npub1');
      }

      const decoded = nip19.decode(npub);
      if (decoded.type !== 'npub') {
        throw new Error('Invalid npub');
      }

      const pubkeyHex = decoded.data as string;

      setStatus('Fetching events...');
      const fetchedEvents = await pool.querySync(relays, {
        kinds: [1],
        authors: [pubkeyHex],
        limit: 50 // Increased limit
      });

      if (fetchedEvents.length === 0) {
        throw new Error('No events found for this pubkey');
      }

      setStatus(`Found ${fetchedEvents.length} events to clone...`);

      if (nsec) {
        if (!nsec.startsWith('nsec1')) {
          throw new Error('Invalid nsec format. Must start with nsec1');
        }

        const decodedNsec = nip19.decode(nsec);
        if (decodedNsec.type !== 'nsec') {
          throw new Error('Invalid nsec');
        }

        const secretKey = decodedNsec.data as Uint8Array;
        const newPubkey = getPublicKey(secretKey);

        // Clone events with progress tracking
        setStatus('Cloning events...');
        const clonedEvents = fetchedEvents.map((event: Event, index: number): Event => {
          setStatus(`Cloning event ${index + 1}/${fetchedEvents.length}...`);
          const newEvent = {
            ...event,
            pubkey: newPubkey,
            created_at: Math.floor(Date.now() / 1000),
            id: '',
            sig: ''
          } as Event;

          return finalizeEvent(newEvent, secretKey);
        });

        // Publish with delay between each event
        setStatus('Publishing events...');
        for (let i = 0; i < clonedEvents.length; i++) {
          setStatus(`Publishing event ${i + 1}/${clonedEvents.length}...`);
          try {
            await Promise.any(
              relays.map(relay =>
                pool.publish([relay], clonedEvents[i])
              )
            );
            // Add delay between publishes to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (err) {
            console.warn(`Failed to publish event ${i + 1}, continuing...`, err);
          }
        }

        setEvents(clonedEvents);
        setStatus('Complete!');
      }
    } catch (error) {
      console.error('Error fetching/cloning events:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
      setIsModalOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 text-yellow-500">Excalibur</h1>
          <p className="text-lg text-slate-300">The Nostr Event Cloner</p>
        </header>

        <Card className="bg-slate-800 border-slate-700 mb-8">
          <CardHeader>
            <CardTitle className="text-2xl text-yellow-500">Identity</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Enter your Nostr Npub"
              value={npub}
              onChange={(e) => setNpub(e.target.value)}
              className="bg-slate-900 border-slate-700 text-white"
            />
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700 mb-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-2xl text-yellow-500">Relays</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={addRelayInput}
              className="text-yellow-500 hover:text-yellow-400"
            >
              <PlusCircle className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {relays.map((relay, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="wss://relay.url"
                  value={relay}
                  onChange={(e) => updateRelay(index, e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white"
                />
                {relays.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRelayInput(index)}
                    className="text-red-500 hover:text-red-400"
                  >
                    <MinusCircle className="h-5 w-5" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="text-center">
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={handleDrawSword}
                className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-4 px-8 rounded-lg transform transition-transform hover:scale-105"
              >
                <Sword className="mr-2 h-5 w-5" />
                Draw the Sword from the Stone
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-800 border-slate-700">
              <DialogHeader>
                <DialogTitle className="text-yellow-500">Enter Your Power</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  type="password"
                  placeholder="Enter your Nsec"
                  value={nsec}
                  onChange={(e) => setNsec(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white"
                />
                <Button
                  onClick={handleCloneEvents}
                  disabled={isLoading}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <Scroll className="animate-spin mr-2 h-5 w-5" />
                      Cloning Events...
                    </div>
                  ) : (
                    'Clone Events'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {events.length > 0 && (
          <>
            {status && (
              <div className="text-sm text-slate-300 mt-2">
                {status}
              </div>
            )}

            {error && (
              <div className="text-sm text-red-500 mt-2">
                {error}
              </div>
            )}
            <Card className="mt-8 bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-2xl text-yellow-500">Cloned Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {events.map((event, index) => (
                    <div
                      key={event.id}
                      className="p-4 bg-slate-900 rounded-lg border border-slate-700 hover:border-yellow-500 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-yellow-500">#{index + 1}</span>
                        <span className="text-sm text-slate-400">
                          {new Date(event.created_at * 1000).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-2 text-slate-300">{event.content}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default App;
