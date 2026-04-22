import { MENU_MEGA } from '@/config/bodhassess.config';
import { cn } from '@/lib/utils';
import { useMenu } from '@/hooks/use-menu';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { MenuItem } from '@/config/types';

export function MegaMenu() {
  const pathname = usePathname();
  const { isActive, hasActiveChild } = useMenu(pathname);

  const linkClass = `
    text-sm text-secondary-foreground font-medium
    hover:text-primary hover:bg-transparent
    focus:text-primary focus:bg-transparent
    data-[active=true]:text-primary data-[active=true]:bg-transparent
    data-[state=open]:text-primary data-[state=open]:bg-transparent
  `;

  return (
    <NavigationMenu>
      <NavigationMenuList className="gap-0">
        {MENU_MEGA.map((item, index) => {
          if (item.path && !item.children) {
            return (
              <NavigationMenuItem key={index}>
                <NavigationMenuLink asChild>
                  <Link
                    href={item.path}
                    className={cn(linkClass)}
                    data-active={isActive(item.path) || undefined}
                  >
                    {item.title}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            );
          }

          if (item.children) {
            return (
              <NavigationMenuItem key={index}>
                <NavigationMenuTrigger
                  className={cn(linkClass)}
                  data-active={hasActiveChild(item.children || []) || undefined}
                >
                  {item.title}
                </NavigationMenuTrigger>
                <NavigationMenuContent className="p-4 min-w-[280px]">
                  <div className="grid gap-1">
                    {flattenMenuChildren(item.children).map((child, ci) => (
                      <Link
                        key={ci}
                        href={child.path || '#'}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-secondary-foreground hover:bg-muted hover:text-primary transition-colors"
                      >
                        {child.icon && <child.icon className="h-4 w-4 text-muted-foreground" />}
                        <span>{child.title}</span>
                      </Link>
                    ))}
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
            );
          }

          return null;
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function flattenMenuChildren(items: MenuItem[]): MenuItem[] {
  const result: MenuItem[] = [];
  for (const item of items) {
    if (item.children) {
      for (const child of item.children) {
        if (child.children) {
          for (const grandchild of child.children) {
            if (grandchild.path) {
              result.push(grandchild);
            } else if (grandchild.children) {
              result.push(...grandchild.children.filter((c: MenuItem) => c.path));
            }
          }
        } else if (child.path) {
          result.push(child);
        }
      }
    } else if (item.path) {
      result.push(item);
    }
  }
  return result;
}
