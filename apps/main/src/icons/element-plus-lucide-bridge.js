import { defineComponent, h } from 'vue'
import LucideIcon from '../components/LucideIcon.vue'

import { __iconNode as bellIconNode } from 'lucide-react/dist/esm/icons/bell.js'
import { __iconNode as messageCircleIconNode } from 'lucide-react/dist/esm/icons/message-circle.js'
import { __iconNode as messageSquareTextIconNode } from 'lucide-react/dist/esm/icons/message-square-text.js'
import { __iconNode as wandSparklesIconNode } from 'lucide-react/dist/esm/icons/wand-sparkles.js'
import { __iconNode as networkIconNode } from 'lucide-react/dist/esm/icons/network.js'
import { __iconNode as libraryIconNode } from 'lucide-react/dist/esm/icons/library.js'
import { __iconNode as cloudIconNode } from 'lucide-react/dist/esm/icons/cloud.js'
import { __iconNode as settingsIconNode } from 'lucide-react/dist/esm/icons/settings.js'
import { __iconNode as fileTextIconNode } from 'lucide-react/dist/esm/icons/file-text.js'
import { __iconNode as refreshCwIconNode } from 'lucide-react/dist/esm/icons/refresh-cw.js'
import { __iconNode as trash2IconNode } from 'lucide-react/dist/esm/icons/trash-2.js'
import { __iconNode as pencilIconNode } from 'lucide-react/dist/esm/icons/pencil.js'
import { __iconNode as uploadIconNode } from 'lucide-react/dist/esm/icons/upload.js'
import { __iconNode as downloadIconNode } from 'lucide-react/dist/esm/icons/download.js'
import { __iconNode as repeatIconNode } from 'lucide-react/dist/esm/icons/repeat.js'
import { __iconNode as circleHelpIconNode } from 'lucide-react/dist/esm/icons/circle-question-mark.js'
import { __iconNode as paintbrushIconNode } from 'lucide-react/dist/esm/icons/paintbrush.js'
import { __iconNode as plusIconNode } from 'lucide-react/dist/esm/icons/plus.js'
import { __iconNode as minusIconNode } from 'lucide-react/dist/esm/icons/minus.js'
import { __iconNode as xIconNode } from 'lucide-react/dist/esm/icons/x.js'
import { __iconNode as searchIconNode } from 'lucide-react/dist/esm/icons/search.js'
import { __iconNode as mapPinIconNode } from 'lucide-react/dist/esm/icons/map-pin.js'
import { __iconNode as copyIconNode } from 'lucide-react/dist/esm/icons/copy.js'
import { __iconNode as wrenchIconNode } from 'lucide-react/dist/esm/icons/wrench.js'
import { __iconNode as linkIconNode } from 'lucide-react/dist/esm/icons/link.js'
import { __iconNode as folderIconNode } from 'lucide-react/dist/esm/icons/folder.js'
import { __iconNode as folderOpenIconNode } from 'lucide-react/dist/esm/icons/folder-open.js'
import { __iconNode as folderPlusIconNode } from 'lucide-react/dist/esm/icons/folder-plus.js'
import { __iconNode as cpuIconNode } from 'lucide-react/dist/esm/icons/cpu.js'
import { __iconNode as triangleAlertIconNode } from 'lucide-react/dist/esm/icons/triangle-alert.js'
import { __iconNode as arrowUpIconNode } from 'lucide-react/dist/esm/icons/arrow-up.js'
import { __iconNode as arrowDownIconNode } from 'lucide-react/dist/esm/icons/arrow-down.js'
import { __iconNode as arrowLeftIconNode } from 'lucide-react/dist/esm/icons/arrow-left.js'
import { __iconNode as arrowRightIconNode } from 'lucide-react/dist/esm/icons/arrow-right.js'
import { __iconNode as chevronRightIconNode } from 'lucide-react/dist/esm/icons/chevron-right.js'
import { __iconNode as chevronDownIconNode } from 'lucide-react/dist/esm/icons/chevron-down.js'
import { __iconNode as circlePlusIconNode } from 'lucide-react/dist/esm/icons/circle-plus.js'
import { __iconNode as circleMinusIconNode } from 'lucide-react/dist/esm/icons/circle-minus.js'
import { __iconNode as checkIconNode } from 'lucide-react/dist/esm/icons/check.js'
import { __iconNode as circleCheckIconNode } from 'lucide-react/dist/esm/icons/circle-check.js'
import { __iconNode as circleXIconNode } from 'lucide-react/dist/esm/icons/circle-x.js'
import { __iconNode as infoIconNode } from 'lucide-react/dist/esm/icons/info.js'
import { __iconNode as loaderCircleIconNode } from 'lucide-react/dist/esm/icons/loader-circle.js'
import { __iconNode as chevronsLeftIconNode } from 'lucide-react/dist/esm/icons/chevrons-left.js'
import { __iconNode as chevronsRightIconNode } from 'lucide-react/dist/esm/icons/chevrons-right.js'
import { __iconNode as ellipsisIconNode } from 'lucide-react/dist/esm/icons/ellipsis.js'
import { __iconNode as eyeIconNode } from 'lucide-react/dist/esm/icons/eye.js'
import { __iconNode as eyeOffIconNode } from 'lucide-react/dist/esm/icons/eye-off.js'
import { __iconNode as calendarIconNode } from 'lucide-react/dist/esm/icons/calendar.js'
import { __iconNode as clockIconNode } from 'lucide-react/dist/esm/icons/clock.js'
import { __iconNode as zoomInIconNode } from 'lucide-react/dist/esm/icons/zoom-in.js'
import { __iconNode as starIconNode } from 'lucide-react/dist/esm/icons/star.js'
import { __iconNode as chevronUpIconNode } from 'lucide-react/dist/esm/icons/chevron-up.js'
import { __iconNode as imageIconNode } from 'lucide-react/dist/esm/icons/image.js'
import { __iconNode as maximizeIconNode } from 'lucide-react/dist/esm/icons/maximize.js'
import { __iconNode as minimize2IconNode } from 'lucide-react/dist/esm/icons/minimize-2.js'
import { __iconNode as zoomOutIconNode } from 'lucide-react/dist/esm/icons/zoom-out.js'
import { __iconNode as rotateCcwIconNode } from 'lucide-react/dist/esm/icons/rotate-ccw.js'
import { __iconNode as rotateCwIconNode } from 'lucide-react/dist/esm/icons/rotate-cw.js'
import { __iconNode as zapIconNode } from 'lucide-react/dist/esm/icons/zap.js'

export * from '@element-plus/icons-vue/dist/index.js'

const createLucideIconComponent = (name, iconNode) =>
  defineComponent({
    name,
    inheritAttrs: false,
    props: {
      size: {
        type: [Number, String],
        default: '1em'
      },
      strokeWidth: {
        type: [Number, String],
        default: 2
      }
    },
    setup(props, { attrs }) {
      return () =>
        h(LucideIcon, {
          ...attrs,
          iconNode,
          size: props.size,
          strokeWidth: props.strokeWidth
        })
    }
  })

export const Bell = createLucideIconComponent('Bell', bellIconNode)
export const ChatDotRound = createLucideIconComponent('ChatDotRound', messageCircleIconNode)
export const ChatLineRound = createLucideIconComponent('ChatLineRound', messageSquareTextIconNode)
export const MagicStick = createLucideIconComponent('MagicStick', wandSparklesIconNode)
export const Connection = createLucideIconComponent('Connection', networkIconNode)
export const Collection = createLucideIconComponent('Collection', libraryIconNode)
export const Cloudy = createLucideIconComponent('Cloudy', cloudIconNode)
export const Setting = createLucideIconComponent('Setting', settingsIconNode)
export const Document = createLucideIconComponent('Document', fileTextIconNode)
export const Refresh = createLucideIconComponent('Refresh', refreshCwIconNode)
export const Delete = createLucideIconComponent('Delete', trash2IconNode)
export const Edit = createLucideIconComponent('Edit', pencilIconNode)
export const Upload = createLucideIconComponent('Upload', uploadIconNode)
export const UploadFilled = createLucideIconComponent('UploadFilled', uploadIconNode)
export const Download = createLucideIconComponent('Download', downloadIconNode)
export const Switch = createLucideIconComponent('Switch', repeatIconNode)
export const QuestionFilled = createLucideIconComponent('QuestionFilled', circleHelpIconNode)
export const Brush = createLucideIconComponent('Brush', paintbrushIconNode)
export const Plus = createLucideIconComponent('Plus', plusIconNode)
export const Minus = createLucideIconComponent('Minus', minusIconNode)
export const Close = createLucideIconComponent('Close', xIconNode)
export const Search = createLucideIconComponent('Search', searchIconNode)
export const Position = createLucideIconComponent('Position', mapPinIconNode)
export const CopyDocument = createLucideIconComponent('CopyDocument', copyIconNode)
export const Tools = createLucideIconComponent('Tools', wrenchIconNode)
export const Link = createLucideIconComponent('Link', linkIconNode)
export const Folder = createLucideIconComponent('Folder', folderIconNode)
export const FolderOpened = createLucideIconComponent('FolderOpened', folderOpenIconNode)
export const FolderAdd = createLucideIconComponent('FolderAdd', folderPlusIconNode)
export const Cpu = createLucideIconComponent('Cpu', cpuIconNode)
export const Warning = createLucideIconComponent('Warning', triangleAlertIconNode)
export const ArrowUp = createLucideIconComponent('ArrowUp', arrowUpIconNode)
export const ArrowDown = createLucideIconComponent('ArrowDown', arrowDownIconNode)
export const ArrowLeft = createLucideIconComponent('ArrowLeft', arrowLeftIconNode)
export const ArrowRight = createLucideIconComponent('ArrowRight', arrowRightIconNode)
export const CaretRight = createLucideIconComponent('CaretRight', chevronRightIconNode)
export const CaretBottom = createLucideIconComponent('CaretBottom', chevronDownIconNode)
export const CirclePlus = createLucideIconComponent('CirclePlus', circlePlusIconNode)
export const Remove = createLucideIconComponent('Remove', circleMinusIconNode)
export const Check = createLucideIconComponent('Check', checkIconNode)
export const CircleCheck = createLucideIconComponent('CircleCheck', circleCheckIconNode)
export const CircleCheckFilled = createLucideIconComponent('CircleCheckFilled', circleCheckIconNode)
export const CircleClose = createLucideIconComponent('CircleClose', circleXIconNode)
export const CircleCloseFilled = createLucideIconComponent('CircleCloseFilled', circleXIconNode)
export const SuccessFilled = createLucideIconComponent('SuccessFilled', circleCheckIconNode)
export const InfoFilled = createLucideIconComponent('InfoFilled', infoIconNode)
export const WarningFilled = createLucideIconComponent('WarningFilled', triangleAlertIconNode)
export const Loading = createLucideIconComponent('Loading', loaderCircleIconNode)
export const DArrowLeft = createLucideIconComponent('DArrowLeft', chevronsLeftIconNode)
export const DArrowRight = createLucideIconComponent('DArrowRight', chevronsRightIconNode)
export const MoreFilled = createLucideIconComponent('MoreFilled', ellipsisIconNode)
export const View = createLucideIconComponent('View', eyeIconNode)
export const Hide = createLucideIconComponent('Hide', eyeOffIconNode)
export const Calendar = createLucideIconComponent('Calendar', calendarIconNode)
export const Clock = createLucideIconComponent('Clock', clockIconNode)
export const ZoomIn = createLucideIconComponent('ZoomIn', zoomInIconNode)
export const StarFilled = createLucideIconComponent('StarFilled', starIconNode)
export const Star = createLucideIconComponent('Star', starIconNode)
export const CaretTop = createLucideIconComponent('CaretTop', chevronUpIconNode)
export const SortUp = createLucideIconComponent('SortUp', chevronUpIconNode)
export const SortDown = createLucideIconComponent('SortDown', chevronDownIconNode)
export const PictureFilled = createLucideIconComponent('PictureFilled', imageIconNode)
export const Back = createLucideIconComponent('Back', arrowLeftIconNode)
export const More = createLucideIconComponent('More', ellipsisIconNode)
export const FullScreen = createLucideIconComponent('FullScreen', maximizeIconNode)
export const ScaleToOriginal = createLucideIconComponent('ScaleToOriginal', minimize2IconNode)
export const ZoomOut = createLucideIconComponent('ZoomOut', zoomOutIconNode)
export const RefreshLeft = createLucideIconComponent('RefreshLeft', rotateCcwIconNode)
export const RefreshRight = createLucideIconComponent('RefreshRight', rotateCwIconNode)
export const Zap = createLucideIconComponent('Zap', zapIconNode)
