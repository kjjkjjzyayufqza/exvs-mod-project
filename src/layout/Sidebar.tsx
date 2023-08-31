import { useState } from "react";
import {
  AppShell,
  Navbar,
  Header,
  Text,
  MediaQuery,
  Burger,
  useMantineTheme,
  NavLink,
  Button,
} from "@mantine/core";
import {
  IconActivity,
  IconChevronRight,
  IconFingerprint,
  IconGauge,
} from "@tabler/icons-react";
import MainPage from "../page/Main/Page";
import { Link } from "react-router-dom";
import { router } from "../routers/routers";
type Props = {
  children: string | JSX.Element | JSX.Element[];
};

export default function AppShellLayout({ children }: Props) {
  const theme = useMantineTheme();
  const [active, setActive] = useState(0);
  const [opened, setOpened] = useState(false);

  const items = router.map((item, index) => (
    <Link key={index} to={item.path}>
      <NavLink
        key={index}
        label={item.label}
        active={index === active}
        icon={<item.icon size="1rem" stroke={1.5} />}
        onClick={() => setActive(index)}
      />
    </Link>
  ));

  return (
    <AppShell
      navbarOffsetBreakpoint="sm"
      asideOffsetBreakpoint="sm"
      navbar={
        <Navbar
          p="md"
          hiddenBreakpoint="sm"
          hidden={!opened}
          width={{ sm: 100, lg: 200 }}
        >
          {items}
        </Navbar>
      }
      header={
        <Header height={{ base: 50, md: 70 }} p="md">
          <div
            style={{ display: "flex", alignItems: "center", height: "100%" }}
          >
            <MediaQuery largerThan="sm" styles={{ display: "none" }}>
              <Burger
                opened={opened}
                onClick={() => setOpened((o) => !o)}
                size="sm"
                color={theme.colors.gray[6]}
                mr="xl"
              />
            </MediaQuery>

            <Text>Application header</Text>
          </div>
        </Header>
      }
    >
      {children}
    </AppShell>
  );
}
