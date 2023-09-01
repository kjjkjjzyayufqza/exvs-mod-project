import { notifications } from "@mantine/notifications";
import { ReactNode } from "react";

export enum notificationsType {
  Warning,
  Success,
  Error,
}

export const showNotification = (
  type?: notificationsType,
  message?: ReactNode
) => {
  switch (type) {
    case notificationsType.Success: {
      notifications.show({
        title: "Success",
        color: "green",
        message: message ?? "Success",
        autoClose: 2000,
      });
      break;
    }
    case notificationsType.Warning: {
      notifications.show({
        title: "Warning",
        color: "yellow",
        message: message ?? "File is incorrect",
        autoClose: 2000,
      });
      break;
    }
    case notificationsType.Error: {
      notifications.show({
        title: "Error",
        color: "red",
        message: message ?? "File is incorrect",
        autoClose: 2000,
      });
      break;
    }
  }
};
