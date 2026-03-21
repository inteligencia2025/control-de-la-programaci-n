import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { HardHat, LogIn, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = isLogin
      ? await signIn(email, password)
      : await signUp(email, password);
    setLoading(false);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else if (!isLogin) {
      toast({ title: '¡Cuenta creada!', description: 'Ya puedes iniciar sesión.' });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="lean-gradient p-3 rounded-xl">
              <HardHat className="h-8 w-8 text-accent" />
            </div>
          </div>
          <CardTitle className="text-2xl">Lean Construction</CardTitle>
          <CardDescription>
            {isLogin ? 'Inicia sesión para acceder a tus proyectos' : 'Crea una cuenta para comenzar'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="Correo electrónico"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {isLogin ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {loading ? 'Cargando...' : isLogin ? 'Iniciar sesión' : 'Crear cuenta'}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-muted-foreground hover:text-primary underline"
            >
              {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
